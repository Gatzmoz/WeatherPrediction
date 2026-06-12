import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

let dbCache = null;

function normalizeName(str) {
  if (!str) return '';
  return str.toUpperCase()
    .replace(/KOTA/g, '')
    .replace(/KABUPATEN/g, '')
    .replace(/KAB\./g, '')
    .replace(/PROVINSI/g, '')
    .replace(/DAERAH KHUSUS IBUKOTA/g, 'DKI')
    .replace(/SPECIAL REGION OF/g, '')
    .replace(/KEPULAUAN/g, '')
    .trim();
}

function loadDb() {
  if (dbCache) return dbCache;

  const csvPath = path.join(process.cwd(), 'src', 'app', 'api', 'regions', 'base.csv');
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  const db = [];
  
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(',');
    if (idx !== -1) {
      const code = lines[i].substring(0, idx).trim();
      const name = lines[i].substring(idx + 1).trim();
      if (code && name) {
        db.push({ code, name });
      }
    }
  }

  dbCache = db;
  return db;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level'); // 'province' | 'regency' | 'district' | 'village'
  const parent = searchParams.get('parent'); // code of parent
  const search = searchParams.get('search'); // query search name
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  // Jika parameter lat dan lon disediakan, jalankan reverse geocode
  if (lat && lon) {
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`;
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'WeatherPredictionApp/1.0 (contact@weatherprediction.app)'
        },
        next: { revalidate: 86400 } // cache reverse lookup for 1 day
      });
      if (!response.ok) {
        return NextResponse.json({ error: `Gagal reverse geocode: HTTP ${response.status}` }, { status: 400 });
      }
      const data = await response.json();
      if (!data.address) {
        return NextResponse.json({ error: 'Alamat tidak ditemukan untuk koordinat tersebut.' }, { status: 404 });
      }

      const address = data.address;
      const db = loadDb();
      if (db.length === 0) {
        return NextResponse.json({ error: 'Database wilayah tidak ditemukan.' }, { status: 500 });
      }

      // Helper pencocokan
      const findBestMatch = (candidates, levelLength, parentCode = '') => {
        const normalizedCandidates = candidates
          .filter(Boolean)
          .map(c => normalizeName(c));
        
        if (normalizedCandidates.length === 0) return null;

        const items = db.filter(item => {
          const correctLevel = item.code.length === levelLength;
          if (!correctLevel) return false;
          if (parentCode) {
            return item.code.startsWith(parentCode + '.');
          }
          return true;
        });

        for (const cand of normalizedCandidates) {
          const exact = items.find(item => normalizeName(item.name) === cand);
          if (exact) return exact;

          const sub = items.find(item => 
            normalizeName(item.name).includes(cand) || 
            cand.includes(normalizeName(item.name))
          );
          if (sub) return sub;
        }
        return null;
      };

      let provMatch = null;
      let regMatch = null;
      let distMatch = null;
      let villMatch = null;

      const villCandidates = [address.village, address.suburb, address.hamlet, address.neighbourhood];
      const distCandidates = [address.subdistrict, address.town, address.city_district, address.municipality];
      const regCandidates = [address.city, address.county, address.city_district];
      const provCandidates = [address.state, address.region];

      // 1. Coba cari kelurahan secara langsung di seluruh DB
      const directVillMatch = findBestMatch(villCandidates, 13);
      if (directVillMatch) {
        villMatch = directVillMatch;
        const parts = villMatch.code.split('.');
        const provCode = parts[0];
        const regCode = `${parts[0]}.${parts[1]}`;
        const distCode = `${parts[0]}.${parts[1]}.${parts[2]}`;
        
        provMatch = db.find(item => item.code === provCode);
        regMatch = db.find(item => item.code === regCode);
        distMatch = db.find(item => item.code === distCode);
      }

      // 2. Jika kelurahan gagal, coba cari kecamatan secara langsung
      if (!distMatch) {
        const directDistMatch = findBestMatch(distCandidates, 8);
        if (directDistMatch) {
          distMatch = directDistMatch;
          const parts = distMatch.code.split('.');
          const provCode = parts[0];
          const regCode = `${parts[0]}.${parts[1]}`;
          
          provMatch = db.find(item => item.code === provCode);
          regMatch = db.find(item => item.code === regCode);
        }
      }

      // 3. Jika kecamatan gagal, coba cari kabupaten secara langsung
      if (!regMatch) {
        const directRegMatch = findBestMatch(regCandidates, 5);
        if (directRegMatch) {
          regMatch = directRegMatch;
          const provCode = regMatch.code.split('.')[0];
          provMatch = db.find(item => item.code === provCode);
        }
      }

      // 4. Jika kabupaten gagal, cari provinsi
      if (!provMatch) {
        provMatch = findBestMatch(provCandidates, 2);
      }

      // Jika provinsi tidak ditemukan sama sekali, gagalkan
      if (!provMatch) {
        return NextResponse.json({ error: 'Provinsi tidak teridentifikasi di Indonesia.' }, { status: 404 });
      }

      // Sekarang lengkapi hierarki ke bawah yang kosong
      if (!regMatch) {
        regMatch = findBestMatch(regCandidates, 5, provMatch.code);
      }
      if (!regMatch) {
        return NextResponse.json({ error: 'Kabupaten/Kota tidak teridentifikasi.', province: provMatch }, { status: 404 });
      }

      if (!distMatch) {
        distMatch = findBestMatch(distCandidates, 8, regMatch.code);
      }
      if (!distMatch) {
        return NextResponse.json({ error: 'Kecamatan tidak teridentifikasi.', province: provMatch, regency: regMatch }, { status: 404 });
      }

      if (!villMatch) {
        villMatch = findBestMatch(villCandidates, 13, distMatch.code);
      }
      if (!villMatch) {
        return NextResponse.json({ 
          error: 'Kelurahan/Desa tidak teridentifikasi.', 
          province: provMatch, 
          regency: regMatch, 
          district: distMatch 
        }, { status: 404 });
      }

      return NextResponse.json({
        province: provMatch,
        regency: regMatch,
        district: distMatch,
        village: villMatch
      });

    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  const db = loadDb();
  if (db.length === 0) {
    return NextResponse.json({ error: 'Database wilayah tidak ditemukan.' }, { status: 500 });
  }

  // Jika parameter search disediakan (cari desa berdasarkan nama)
  if (search) {
    const query = search.toLowerCase();
    
    // Cari desa yang namanya cocok
    const villages = db.filter(item => 
      item.code.length === 13 && 
      item.name.toLowerCase().includes(query)
    ).slice(0, 15);

    // Untuk setiap desa, cari nama kecamatan, kab/kota, dan provinsi induknya
    const results = villages.map(village => {
      const parts = village.code.split('.');
      const provCode = parts[0];
      const regCode = `${parts[0]}.${parts[1]}`;
      const distCode = `${parts[0]}.${parts[1]}.${parts[2]}`;
      
      const provName = db.find(item => item.code === provCode)?.name || '';
      const regName = db.find(item => item.code === regCode)?.name || '';
      const distName = db.find(item => item.code === distCode)?.name || '';

      return {
        code: village.code,
        name: village.name,
        district: distName,
        regency: regName,
        province: provName
      };
    });

    return NextResponse.json(results);
  }

  if (!level) {
    return NextResponse.json({ error: 'Parameter level diperlukan.' }, { status: 400 });
  }

  let results = [];

  if (level === 'province') {
    results = db.filter(item => item.code.length === 2);
  } else if (level === 'regency') {
    if (!parent) return NextResponse.json({ error: 'Parameter parent diperlukan untuk level regency.' }, { status: 400 });
    results = db.filter(item => item.code.length === 5 && item.code.startsWith(parent + '.'));
  } else if (level === 'district') {
    if (!parent) return NextResponse.json({ error: 'Parameter parent diperlukan untuk level district.' }, { status: 400 });
    results = db.filter(item => item.code.length === 8 && item.code.startsWith(parent + '.'));
  } else if (level === 'village') {
    if (!parent) return NextResponse.json({ error: 'Parameter parent diperlukan untuk level village.' }, { status: 400 });
    results = db.filter(item => item.code.length === 13 && item.code.startsWith(parent + '.'));
  } else {
    return NextResponse.json({ error: 'Level tidak valid. Harus salah satu dari province, regency, district, village.' }, { status: 400 });
  }

  return NextResponse.json(results);
}
