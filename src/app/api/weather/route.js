import { NextResponse } from 'next/server';

// Modul 1: Algoritma Klasifikasi Cuaca (Rule-Based)
function classifyWeather(precip, cloud) {
  // Constraint: Jika null / tidak ditemukan, fallback ke 0 sebelum evaluasi
  const p = precip !== null && precip !== undefined ? precip : 0;
  const cc = cloud !== null && cloud !== undefined ? cloud : 0;

  // Evaluasi sekuensial
  if (p > 10) return 'Hujan Lebat';
  if (p > 5 && p <= 10) return 'Hujan Sedang';
  if (p > 0.1 && p <= 5) return 'Hujan Ringan';
  if (p <= 0.1 && cc >= 90) return 'Berawan';
  if (p <= 0.1 && cc >= 10 && cc < 90) return 'Cerah Berawan';
  if (p <= 0.1 && cc < 10) return 'Cerah';
  return 'Cerah';
}

// Deskripsi & Icon untuk Unified Code/Class
const CUACA_INFO_MAP = {
  'Cerah': { label: 'Cerah', icon: 'Sun', color: 'sunny' },
  'Cerah Berawan': { label: 'Cerah Berawan', icon: 'CloudSun', color: 'partly-cloudy' },
  'Berawan': { label: 'Berawan', icon: 'Cloud', color: 'cloudy' },
  'Hujan Ringan': { label: 'Hujan Ringan', icon: 'CloudDrizzle', color: 'drizzle' },
  'Hujan Sedang': { label: 'Hujan Sedang', icon: 'CloudRain', color: 'rainy' },
  'Hujan Lebat': { label: 'Hujan Lebat', icon: 'CloudLightning', color: 'heavy-rain' }
};

// Format tanggal ke WIB (Asia/Jakarta) YYYY-MM-DD HH:mm
function formatToWIB(date) {
  const options = {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('id-ID', options);
  const parts = formatter.formatToParts(date);
  const p = {};
  parts.forEach(part => { p[part.type] = part.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// Helper to parse current weather from OpenMeteo responses, with hourly fallback
function parseOpenMeteoCurrent(data) {
  if (!data) return null;
  if (data.current) {
    return {
      temp: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      feelsLike: data.current.apparent_temperature,
      precipitation: data.current.precipitation || 0,
      cloud: data.current.cloud_cover || 0,
      weather_class: classifyWeather(data.current.precipitation, data.current.cloud_cover)
    };
  } else if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
    const nowMs = Date.now();
    let closestIdx = 0;
    let minDiff = Infinity;
    data.hourly.time.forEach((t, idx) => {
      const diff = Math.abs(new Date(t).getTime() - nowMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    return {
      temp: data.hourly.temperature_2m[closestIdx],
      humidity: data.hourly.relative_humidity_2m[closestIdx],
      windSpeed: data.hourly.wind_speed_10m[closestIdx],
      feelsLike: data.hourly.apparent_temperature[closestIdx],
      precipitation: data.hourly.precipitation[closestIdx] || 0,
      cloud: data.hourly.cloud_cover[closestIdx] || 0,
      weather_class: classifyWeather(data.hourly.precipitation[closestIdx], data.hourly.cloud_cover[closestIdx])
    };
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const cityName = searchParams.get('city') || 'Koordinat Terpilih';
  const adm4 = searchParams.get('adm4');

  let latVal = lat;
  let lonVal = lon;
  let cityNameVal = cityName;

  if (!adm4 && (!lat || !lon)) {
    return NextResponse.json({ error: 'Parameter koordinat (lat, lon) atau kode wilayah (adm4) diperlukan.' }, { status: 400 });
  }

  const weatherApiKey = process.env.WEATHER_API_KEY;
  const openWeatherMapKey = process.env.OPENWEATHERMAP_API_KEY;

  const results = {
    openMeteo: { name: 'Open-Meteo', active: false, simulated: false, data: null, hourly: null, error: null },
    weatherApi: { name: 'WeatherAPI', active: false, simulated: false, data: null, hourly: null, error: null },
    openWeatherMap: { name: 'OpenWeatherMap', active: false, simulated: false, data: null, hourly: null, error: null },
    gfs: { name: 'GFS (NOAA)', active: false, simulated: false, data: null, hourly: null, error: null },
    ecmwf: { name: 'ECMWF (Europe)', active: false, simulated: false, data: null, hourly: null, error: null },
    icon: { name: 'ICON (DWD)', active: false, simulated: false, data: null, hourly: null, error: null },
    bmkg: { name: 'BMKG (Indonesia)', active: false, simulated: false, data: null, hourly: null, error: null }
  };

  // Helper deviasi acak simulasi
  const generateSimulatedPoint = (basePoint, tempOffset, humidityOffset, windOffset, precipOffset, cloudOffset) => {
    if (!basePoint) return null;
    const temp = Math.round((basePoint.temp + tempOffset) * 10) / 10;
    const humidity = Math.min(100, Math.max(0, basePoint.humidity + humidityOffset));
    const windSpeed = Math.max(0, Math.round((basePoint.windSpeed + windOffset) * 10) / 10);
    const feelsLike = Math.round((basePoint.feelsLike + tempOffset * 0.8) * 10) / 10;
    const precipitation = Math.max(0, Math.round((basePoint.precipitation + precipOffset) * 10) / 10);
    const cloud = Math.min(100, Math.max(0, basePoint.cloud + cloudOffset));

    return {
      temp,
      humidity,
      windSpeed,
      feelsLike,
      precipitation,
      cloud,
      weather_class: classifyWeather(precipitation, cloud)
    };
  };

  // --- FETCH BMKG FIRST JIKA ADM4 DISEDIAKAN ---
  if (adm4) {
    try {
      const bmkgUrl = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`;
      const bmkgRes = await fetch(bmkgUrl, { next: { revalidate: 900 } });
      if (bmkgRes.ok) {
        const bmkgData = await bmkgRes.json();
        
        // Update koordinat dan nama kelurahan
        if (bmkgData.lokasi) {
          latVal = bmkgData.lokasi.lat.toString();
          lonVal = bmkgData.lokasi.lon.toString();
          cityNameVal = `${bmkgData.lokasi.desa}, Kec. ${bmkgData.lokasi.kecamatan}`;
        }

        const bmkgHourlyList = [];
        if (bmkgData.data && bmkgData.data[0] && bmkgData.data[0].cuaca) {
          bmkgData.data[0].cuaca.forEach(dayCuaca => {
            if (Array.isArray(dayCuaca)) {
              dayCuaca.forEach(item => {
                const precip = item.tp !== undefined && item.tp !== null ? item.tp : 0;
                const cloud = item.tcc !== undefined && item.tcc !== null ? item.tcc : 0;
                const wind = item.ws !== undefined && item.ws !== null ? item.ws / 3.6 : 0;
                bmkgHourlyList.push({
                  time: new Date(item.datetime).getTime(),
                  temp: item.t,
                  humidity: item.hu,
                  windSpeed: wind,
                  feelsLike: item.t, // Fallback ke suhu karena BMKG tidak menyediakan apparent temperature
                  precipitation: precip,
                  cloud: cloud,
                  weather_class: classifyWeather(precip, cloud)
                });
              });
            }
          });
        }

        results.bmkg.hourly = bmkgHourlyList;

        if (bmkgHourlyList.length > 0) {
          const nowMs = Date.now();
          let closestIdx = 0;
          let minDiff = Infinity;
          bmkgHourlyList.forEach((pt, idx) => {
            const diff = Math.abs(pt.time - nowMs);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = idx;
            }
          });
          results.bmkg.data = bmkgHourlyList[closestIdx];
          results.bmkg.active = true;
        }
      } else {
        results.bmkg.error = `HTTP ${bmkgRes.status}`;
      }
    } catch (err) {
      results.bmkg.error = err.message;
    }
  }

  // --- PARALLEL FETCH UNTUK SEMUA API DAN MODEL ---
  await Promise.all([
    // 1. Open-Meteo
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latVal}&longitude=${lonVal}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.openMeteo.data = parseOpenMeteoCurrent(data);
        if (data.hourly) {
          results.openMeteo.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            precipitation: data.hourly.precipitation[idx] || 0,
            cloud: data.hourly.cloud_cover[idx] || 0,
            weather_class: classifyWeather(data.hourly.precipitation[idx], data.hourly.cloud_cover[idx])
          }));
        }
        results.openMeteo.active = true;
      } catch (err) {
        results.openMeteo.error = err.message;
      }
    })(),

    // 2. WeatherAPI (Kunci API)
    (async () => {
      if (!weatherApiKey) return;
      try {
        const url = `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=${latVal},${lonVal}&days=2`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.weatherApi.data = {
          temp: data.current.temp_c,
          humidity: data.current.humidity,
          windSpeed: data.current.wind_kph / 3.6,
          feelsLike: data.current.feelslike_c,
          precipitation: data.current.precip_mm || 0,
          cloud: data.current.cloud || 0,
          weather_class: classifyWeather(data.current.precip_mm, data.current.cloud)
        };
        const hourlyList = [];
        data.forecast.forecastday.forEach(day => {
          day.hour.forEach(hr => {
            hourlyList.push({
              time: hr.time_epoch * 1000,
              temp: hr.temp_c,
              humidity: hr.humidity,
              windSpeed: hr.wind_kph / 3.6,
              feelsLike: hr.feelslike_c,
              precipitation: hr.precip_mm || 0,
              cloud: hr.cloud || 0,
              weather_class: classifyWeather(hr.precip_mm, hr.cloud)
            });
          });
        });
        results.weatherApi.hourly = hourlyList;
        results.weatherApi.active = true;
      } catch (err) {
        results.weatherApi.error = err.message;
      }
    })(),

    // 3. OpenWeatherMap (Kunci API)
    (async () => {
      if (!openWeatherMapKey) return;
      try {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latVal}&lon=${lonVal}&appid=${openWeatherMapKey}&units=metric`;
        const currentRes = await fetch(currentUrl, { next: { revalidate: 900 } });
        if (!currentRes.ok) throw new Error(`HTTP ${currentRes.status}`);
        const currentData = await currentRes.json();
        const precipCurrent = currentData.rain ? (currentData.rain['1h'] || 0) : 0;
        const cloudCurrent = currentData.clouds ? currentData.clouds.all : 0;
        results.openWeatherMap.data = {
          temp: currentData.main.temp,
          humidity: currentData.main.humidity,
          windSpeed: currentData.wind.speed,
          feelsLike: currentData.main.feels_like,
          precipitation: precipCurrent,
          cloud: cloudCurrent,
          weather_class: classifyWeather(precipCurrent, cloudCurrent)
        };
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${latVal}&lon=${lonVal}&appid=${openWeatherMapKey}&units=metric`;
        const forecastRes = await fetch(forecastUrl, { next: { revalidate: 900 } });
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          results.openWeatherMap.hourly = forecastData.list.map(item => {
            const precip = item.rain ? (item.rain['3h'] / 3 || 0) : 0;
            const cloud = item.clouds ? item.clouds.all : 0;
            return {
              time: item.dt * 1000,
              temp: item.main.temp,
              humidity: item.main.humidity,
              windSpeed: item.wind.speed,
              feelsLike: item.main.feels_like,
              precipitation: precip,
              cloud: cloud,
              weather_class: classifyWeather(precip, cloud)
            };
          });
        }
        results.openWeatherMap.active = true;
      } catch (err) {
        results.openWeatherMap.error = err.message;
      }
    })(),

    // 4. GFS (NOAA Model)
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/gfs?latitude=${latVal}&longitude=${lonVal}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.gfs.data = parseOpenMeteoCurrent(data);
        if (data.hourly) {
          results.gfs.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            precipitation: data.hourly.precipitation[idx] || 0,
            cloud: data.hourly.cloud_cover[idx] || 0,
            weather_class: classifyWeather(data.hourly.precipitation[idx], data.hourly.cloud_cover[idx])
          }));
        }
        results.gfs.active = true;
      } catch (err) {
        results.gfs.error = err.message;
      }
    })(),

    // 5. ECMWF (Europe Model)
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/ecmwf?latitude=${latVal}&longitude=${lonVal}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.ecmwf.data = parseOpenMeteoCurrent(data);
        if (data.hourly) {
          results.ecmwf.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            precipitation: data.hourly.precipitation[idx] || 0,
            cloud: data.hourly.cloud_cover[idx] || 0,
            weather_class: classifyWeather(data.hourly.precipitation[idx], data.hourly.cloud_cover[idx])
          }));
        }
        results.ecmwf.active = true;
      } catch (err) {
        results.ecmwf.error = err.message;
      }
    })(),

    // 6. ICON (German DWD Model)
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${latVal}&longitude=${lonVal}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.icon.data = parseOpenMeteoCurrent(data);
        if (data.hourly) {
          results.icon.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            precipitation: data.hourly.precipitation[idx] || 0,
            cloud: data.hourly.cloud_cover[idx] || 0,
            weather_class: classifyWeather(data.hourly.precipitation[idx], data.hourly.cloud_cover[idx])
          }));
        }
        results.icon.active = true;
      } catch (err) {
        results.icon.error = err.message;
      }
    })()
  ]);

  // Fallback Simulasi jika WeatherAPI atau OpenWeatherMap tidak aktif
  if (!results.weatherApi.active && results.openMeteo.data) {
    results.weatherApi.data = generateSimulatedPoint(results.openMeteo.data, +0.6, -4, +0.8, 0.1, 15);
    if (results.openMeteo.hourly) {
      results.weatherApi.hourly = results.openMeteo.hourly.map(p => ({
        time: p.time,
        ...generateSimulatedPoint(p, +0.6, -4, +0.8, 0.1, 15)
      }));
    }
    results.weatherApi.active = true;
    results.weatherApi.simulated = true;
  }

  if (!results.openWeatherMap.active && results.openMeteo.data) {
    results.openWeatherMap.data = generateSimulatedPoint(results.openMeteo.data, -0.4, +3, -0.5, 0, -10);
    if (results.openMeteo.hourly) {
      results.openWeatherMap.hourly = results.openMeteo.hourly.map(p => ({
        time: p.time,
        ...generateSimulatedPoint(p, -0.4, +3, -0.5, 0, -10)
      }));
    }
    results.openWeatherMap.active = true;
    results.openWeatherMap.simulated = true;
  }

  const activeApis = Object.values(results).filter(api => api.active && api.data !== null);
  const N = activeApis.length;
  
  if (N === 0) {
    return NextResponse.json({ error: 'Gagal mengambil data cuaca.' }, { status: 500 });
  }

  // --- RESTRUKTURISASI ENSEMBLE ---

  // Helper statistik (Mean & Sample StdDev)
  const calculateMean = (vals) => vals.reduce((s, v) => s + v, 0) / vals.length;
  const calculateStdDev = (vals, mean) => {
    if (vals.length <= 1) return 0;
    const sumSq = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0);
    return Math.sqrt(sumSq / (vals.length - 1));
  };

  // 1. Hitung Ensemble untuk Waktu Sekarang
  const currentTemps = activeApis.map(a => a.data.temp);
  const currentHumidities = activeApis.map(a => a.data.humidity);
  
  const currentTempMean = calculateMean(currentTemps);
  const currentTempStdDev = calculateStdDev(currentTemps, currentTempMean);
  const currentHumiMean = calculateMean(currentHumidities);
  const currentHumiStdDev = calculateStdDev(currentHumidities, currentHumiMean);

  // Voting Cuaca Sekarang (Kategorik)
  const currentClasses = activeApis.map(a => a.data.weather_class);
  const currentVotes = {};
  currentClasses.forEach(cls => { currentVotes[cls] = (currentVotes[cls] || 0) + 1; });
  
  let currentMode = 'Cerah';
  let currentMaxVotes = 0;
  Object.keys(currentVotes).forEach(cls => {
    if (currentVotes[cls] > currentMaxVotes) {
      currentMaxVotes = currentVotes[cls];
      currentMode = cls;
    } else if (currentVotes[cls] === currentMaxVotes) {
      const priority = { 'Hujan Lebat': 6, 'Hujan Sedang': 5, 'Hujan Ringan': 4, 'Berawan': 3, 'Cerah Berawan': 2, 'Cerah': 1 };
      if (priority[cls] > priority[currentMode]) currentMode = cls;
    }
  });

  const currentModeProb = Math.round((currentVotes[currentMode] / N) * 10000) / 100;

  const avgWindSpeed = calculateMean(activeApis.map(api => api.data.windSpeed));
  const avgFeelsLike = calculateMean(activeApis.map(api => api.data.feelsLike));
  const avgPrecipitation = calculateMean(activeApis.map(api => api.data.precipitation));

  // --- PROSES DATA RAMALAN CUACA PER 3 JAM (24 JAM KE DEPAN) ---
  const Mean_StdDev_RH_Temp = [];
  const Spread_Klasifikasi_Cuaca = [];
  const forecastList = [];

  const now = new Date();
  
  for (let i = 1; i <= 8; i++) {
    const targetTime = new Date(now.getTime() + i * 3 * 60 * 60 * 1000);
    const targetTimestamp = targetTime.getTime();

    const findClosestPoint = (hourlyList) => {
      if (!hourlyList || hourlyList.length === 0) return null;
      return hourlyList.reduce((prev, curr) => 
        Math.abs(curr.time - targetTimestamp) < Math.abs(prev.time - targetTimestamp) ? curr : prev
      );
    };

    const pointsAtTime = [];
    Object.keys(results).forEach(key => {
      const pt = findClosestPoint(results[key].hourly);
      if (pt) pointsAtTime.push({ key, data: pt });
    });

    if (pointsAtTime.length > 0) {
      const timeWibStr = formatToWIB(targetTime);

      // --- Modul 2: Agregasi Variabel Kontinu (Suhu & Kelembapan) ---
      const tempsAtTime = pointsAtTime.map(p => p.data.temp);
      const humisAtTime = pointsAtTime.map(p => p.data.humidity);
      
      const tMean = calculateMean(tempsAtTime);
      const tStd = calculateStdDev(tempsAtTime, tMean);
      const hMean = calculateMean(humisAtTime);
      const hStd = calculateStdDev(humisAtTime, hMean);

      // Simpan ke data structure 1 (Mean_StdDev_RH_Temp)
      Mean_StdDev_RH_Temp.push({
        time_wib: timeWibStr,
        Temp_Mean: Math.round(tMean * 100) / 100,
        Temp_StdDev: Math.round(tStd * 100) / 100,
        Humi_Mean: Math.round(hMean * 100) / 100,
        Humi_StdDev: Math.round(hStd * 100) / 100
      });

      // --- Modul 3: Analisis Probabilistik Variabel Kategorik & Konsensus ---
      const classesAtTime = pointsAtTime.map(p => p.data.weather_class);
      const counts = { 'Cerah': 0, 'Cerah Berawan': 0, 'Berawan': 0, 'Hujan Ringan': 0, 'Hujan Sedang': 0, 'Hujan Lebat': 0 };
      
      // Hitung kemunculan
      classesAtTime.forEach(cls => {
        if (counts[cls] !== undefined) counts[cls]++;
      });

      const totalMembers = pointsAtTime.length;
      
      // Hitung probabilitas spread (%)
      const Cerah_Prob = Math.round((counts['Cerah'] / totalMembers) * 10000) / 100;
      const CerahBerawan_Prob = Math.round((counts['Cerah Berawan'] / totalMembers) * 10000) / 100;
      const Berawan_Prob = Math.round((counts['Berawan'] / totalMembers) * 10000) / 100;
      const HujanRingan_Prob = Math.round((counts['Hujan Ringan'] / totalMembers) * 10000) / 100;
      const HujanSedang_Prob = Math.round((counts['Hujan Sedang'] / totalMembers) * 10000) / 100;
      const HujanLebat_Prob = Math.round((counts['Hujan Lebat'] / totalMembers) * 10000) / 100;

      // Mode (Prediksi Konsensus)
      let modeClass = 'Cerah';
      let maxCount = -1;
      Object.keys(counts).forEach(cls => {
        if (counts[cls] > maxCount) {
          maxCount = counts[cls];
          modeClass = cls;
        } else if (counts[cls] === maxCount) {
          // Tie-breaker
          const priority = { 'Hujan Lebat': 6, 'Hujan Sedang': 5, 'Hujan Ringan': 4, 'Berawan': 3, 'Cerah Berawan': 2, 'Cerah': 1 };
          if (priority[cls] > priority[modeClass]) modeClass = cls;
        }
      });

      const modeProb = Math.round((counts[modeClass] / totalMembers) * 10000) / 100;

      // Simpan ke data structure 2 (Spread_Klasifikasi_Cuaca)
      Spread_Klasifikasi_Cuaca.push({
        time_wib: timeWibStr,
        Cerah: Cerah_Prob,
        'Cerah Berawan': CerahBerawan_Prob,
        Berawan: Berawan_Prob,
        'Hujan Ringan': HujanRingan_Prob,
        'Hujan Sedang': HujanSedang_Prob,
        'Hujan Lebat': HujanLebat_Prob,
        Prediksi_Paling_Mungkin: modeClass
      });

      // Format Jam dan Hari untuk Tampilan Widget
      const hourStr = targetTime.getHours().toString().padStart(2, '0') + ':00';
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const dateStr = `${dayNames[targetTime.getDay()]} ${targetTime.getDate()} ${monthNames[targetTime.getMonth()]}`;

      // Hitung kecepatan angin rata-rata
      const windAtTime = pointsAtTime.map(p => p.data.windSpeed);
      const avgWindAtTime = calculateMean(windAtTime);

      forecastList.push({
        time: targetTime.toISOString(),
        displayTime: hourStr,
        displayDate: dateStr,
        temp: Math.round(tMean * 10) / 10,
        humidity: Math.round(hMean),
        windSpeed: Math.round(avgWindAtTime * 10) / 10,
        weather: {
          code: modeClass,
          percentage: modeProb,
          ...CUACA_INFO_MAP[modeClass]
        },
        sources: {
          openMeteo: results.openMeteo.hourly ? { temp: findClosestPoint(results.openMeteo.hourly).temp, icon: CUACA_INFO_MAP[findClosestPoint(results.openMeteo.hourly).weather_class].icon } : null,
          weatherApi: results.weatherApi.hourly ? { temp: findClosestPoint(results.weatherApi.hourly).temp, icon: CUACA_INFO_MAP[findClosestPoint(results.weatherApi.hourly).weather_class].icon } : null,
          openWeatherMap: results.openWeatherMap.hourly ? { temp: findClosestPoint(results.openWeatherMap.hourly).temp, icon: CUACA_INFO_MAP[findClosestPoint(results.openWeatherMap.hourly).weather_class].icon } : null,
          gfs: results.gfs.hourly ? { temp: findClosestPoint(results.gfs.hourly).temp, icon: CUACA_INFO_MAP[findClosestPoint(results.gfs.hourly).weather_class].icon } : null,
          ecmwf: results.ecmwf.hourly ? { temp: findClosestPoint(results.ecmwf.hourly).temp, icon: CUACA_INFO_MAP[findClosestPoint(results.ecmwf.hourly).weather_class].icon } : null,
          icon: results.icon.hourly ? { temp: findClosestPoint(results.icon.hourly).temp, icon: CUACA_INFO_MAP[findClosestPoint(results.icon.hourly).weather_class].icon } : null,
          bmkg: results.bmkg.hourly ? { temp: findClosestPoint(results.bmkg.hourly).temp, icon: CUACA_INFO_MAP[findClosestPoint(results.bmkg.hourly).weather_class].icon } : null
        }
      });
    }
  }

  // Ambil informasi cuaca konsensus
  const consensusWeather = {
    code: currentMode,
    percentage: currentModeProb,
    ...CUACA_INFO_MAP[currentMode]
  };

  return NextResponse.json({
    city: cityNameVal,
    coordinates: { lat: latVal, lon: lonVal },
    timestamp: new Date().toISOString(),
    ensemble: {
      temp: Math.round(currentTempMean * 10) / 10,
      temp_stddev: Math.round(currentTempStdDev * 100) / 100,
      humidity: Math.round(currentHumiMean),
      humi_stddev: Math.round(currentHumiStdDev * 100) / 100,
      windSpeed: Math.round(avgWindSpeed * 10) / 10,
      feelsLike: Math.round(avgFeelsLike * 10) / 10,
      precipitation: Math.round(avgPrecipitation * 10) / 10,
      weather: consensusWeather,
      confidence: {
        level: currentTempStdDev < 0.8 ? 'Sangat Tinggi' : currentTempStdDev < 1.8 ? 'Tinggi' : currentTempStdDev < 3.0 ? 'Sedang' : 'Rendah',
        score: Math.round(Math.max(40, 100 - (currentTempStdDev * 15))),
        stdDev: Math.round(currentTempStdDev * 100) / 100
      }
    },
    forecast: forecastList,
    Mean_StdDev_RH_Temp,
    Spread_Klasifikasi_Cuaca,
    sources: {
      openMeteo: {
        name: results.openMeteo.name,
        active: results.openMeteo.active,
        simulated: results.openMeteo.simulated,
        temp: results.openMeteo.data?.temp || null,
        humidity: results.openMeteo.data?.humidity || null,
        windSpeed: results.openMeteo.data?.windSpeed || null,
        weather: results.openMeteo.data ? { code: results.openMeteo.data.weather_class, ...CUACA_INFO_MAP[results.openMeteo.data.weather_class] } : null,
        error: results.openMeteo.error
      },
      weatherApi: {
        name: results.weatherApi.name,
        active: results.weatherApi.active,
        simulated: results.weatherApi.simulated,
        temp: results.weatherApi.data?.temp || null,
        humidity: results.weatherApi.data?.humidity || null,
        windSpeed: results.weatherApi.data?.windSpeed || null,
        weather: results.weatherApi.data ? { code: results.weatherApi.data.weather_class, ...CUACA_INFO_MAP[results.weatherApi.data.weather_class] } : null,
        error: results.weatherApi.error
      },
      openWeatherMap: {
        name: results.openWeatherMap.name,
        active: results.openWeatherMap.active,
        simulated: results.openWeatherMap.simulated,
        temp: results.openWeatherMap.data?.temp || null,
        humidity: results.openWeatherMap.data?.humidity || null,
        windSpeed: results.openWeatherMap.data?.windSpeed || null,
        weather: results.openWeatherMap.data ? { code: results.openWeatherMap.data.weather_class, ...CUACA_INFO_MAP[results.openWeatherMap.data.weather_class] } : null,
        error: results.openWeatherMap.error
      },
      gfs: {
        name: results.gfs.name,
        active: results.gfs.active,
        simulated: results.gfs.simulated,
        temp: results.gfs.data?.temp || null,
        humidity: results.gfs.data?.humidity || null,
        windSpeed: results.gfs.data?.windSpeed || null,
        weather: results.gfs.data ? { code: results.gfs.data.weather_class, ...CUACA_INFO_MAP[results.gfs.data.weather_class] } : null,
        error: results.gfs.error
      },
      ecmwf: {
        name: results.ecmwf.name,
        active: results.ecmwf.active,
        simulated: results.ecmwf.simulated,
        temp: results.ecmwf.data?.temp || null,
        humidity: results.ecmwf.data?.humidity || null,
        windSpeed: results.ecmwf.data?.windSpeed || null,
        weather: results.ecmwf.data ? { code: results.ecmwf.data.weather_class, ...CUACA_INFO_MAP[results.ecmwf.data.weather_class] } : null,
        error: results.ecmwf.error
      },
      icon: {
        name: results.icon.name,
        active: results.icon.active,
        simulated: results.icon.simulated,
        temp: results.icon.data?.temp || null,
        humidity: results.icon.data?.humidity || null,
        windSpeed: results.icon.data?.windSpeed || null,
        weather: results.icon.data ? { code: results.icon.data.weather_class, ...CUACA_INFO_MAP[results.icon.data.weather_class] } : null,
        error: results.icon.error
      },
      bmkg: {
        name: results.bmkg.name,
        active: results.bmkg.active,
        simulated: results.bmkg.simulated,
        temp: results.bmkg.data?.temp || null,
        humidity: results.bmkg.data?.humidity || null,
        windSpeed: results.bmkg.data?.windSpeed || null,
        weather: results.bmkg.data ? { code: results.bmkg.data.weather_class, ...CUACA_INFO_MAP[results.bmkg.data.weather_class] } : null,
        error: results.bmkg.error
      }
    }
  });
}

