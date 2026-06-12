import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

let dbCache = null;

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
