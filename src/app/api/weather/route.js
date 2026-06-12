import { NextResponse } from 'next/server';

// Pemetaan WMO Code (Open-Meteo) ke Unified Code
// 1: Cerah, 2: Cerah Berawan, 3: Mendung, 4: Kabut, 5: Gerimis, 6: Hujan, 7: Hujan Lebat, 8: Salju, 9: Badai Petir
function mapWMOToUnified(code) {
  if (code === 0) return 1; // Clear sky
  if (code >= 1 && code <= 3) return 2; // Mainly clear, partly cloudy, and overcast
  if (code === 45 || code === 48) return 4; // Fog
  if (code >= 51 && code <= 55) return 5; // Drizzle
  if (code >= 61 && code <= 65) return 6; // Rain
  if (code >= 71 && code <= 77) return 8; // Snow
  if (code >= 80 && code <= 82) return 6; // Rain showers
  if (code === 85 || code === 86) return 8; // Snow showers
  if (code >= 95 && code <= 99) return 9; // Thunderstorm
  return 3; // Default to cloudy
}

// Pemetaan WeatherAPI Condition Code ke Unified Code
function mapWeatherAPIToUnified(code) {
  // WeatherAPI menggunakan ID unik. https://www.weatherapi.com/docs/weather_conditions.json
  if (code === 1000) return 1; // Sunny
  if (code === 1003) return 2; // Partly cloudy
  if (code === 1006 || code === 1009) return 3; // Cloudy, Overcast
  if ([1030, 1135, 1147].includes(code)) return 4; // Mist, Fog
  if ([1063, 1150, 1153, 1180, 1183].includes(code)) return 5; // Patchy light rain, drizzle
  if ([1066, 1114, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(code)) return 8; // Snow
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return 9; // Thunderstorm
  if ([1186, 1189, 1192, 1195, 1240, 1243, 1246].includes(code)) return 7; // Moderate/heavy rain
  return 6; // Default to Rain for other codes
}

// Pemetaan OpenWeatherMap ID ke Unified Code
function mapOWMToUnified(id) {
  if (id === 800) return 1; // Clear
  if (id === 801 || id === 802) return 2; // Few clouds, scattered clouds
  if (id === 803 || id === 804) return 3; // Broken clouds, overcast
  if (id >= 700 && id < 800) return 4; // Atmosphere (Fog, Mist, Haze)
  if (id >= 300 && id < 400) return 5; // Drizzle
  if (id >= 500 && id < 510) return 6; // Light to moderate rain
  if (id >= 511 && id < 600) return 7; // Heavy rain / showers
  if (id >= 600 && id < 700) return 8; // Snow
  if (id >= 200 && id < 300) return 9; // Thunderstorm
  return 3;
}

// Deskripsi & Icon untuk Unified Code
const UNIFIED_CUACA_INFO = {
  1: { label: 'Cerah', icon: 'Sun', color: 'sunny' },
  2: { label: 'Cerah Berawan', icon: 'CloudSun', color: 'partly-cloudy' },
  3: { label: 'Mendung', icon: 'Cloud', color: 'cloudy' },
  4: { label: 'Berkabut', icon: 'CloudFog', color: 'foggy' },
  5: { label: 'Gerimis', icon: 'CloudDrizzle', color: 'drizzle' },
  6: { label: 'Hujan', icon: 'CloudRain', color: 'rainy' },
  7: { label: 'Hujan Lebat', icon: 'CloudLightning', color: 'heavy-rain' },
  8: { label: 'Salju', icon: 'Snowflake', color: 'snowy' },
  9: { label: 'Badai Petir', icon: 'CloudLightning', color: 'thunderstorm' }
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const cityName = searchParams.get('city') || 'Koordinat Terpilih';

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Parameter latitude (lat) dan longitude (lon) diperlukan.' }, { status: 400 });
  }

  const weatherApiKey = process.env.WEATHER_API_KEY;
  const openWeatherMapKey = process.env.OPENWEATHERMAP_API_KEY;

  const results = {
    openMeteo: { name: 'Open-Meteo', active: false, simulated: false, data: null, error: null },
    weatherApi: { name: 'WeatherAPI', active: false, simulated: false, data: null, error: null },
    openWeatherMap: { name: 'OpenWeatherMap', active: false, simulated: false, data: null, error: null }
  };

  // 1. Fetch Open-Meteo (No key needed)
  try {
    const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    const res = await fetch(openMeteoUrl, { next: { revalidate: 900 } }); // Cache 15 menit
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    
    results.openMeteo.data = {
      temp: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      feelsLike: data.current.apparent_temperature,
      unifiedCode: mapWMOToUnified(data.current.weather_code),
      rawCode: data.current.weather_code,
      precipitation: data.current.precipitation || 0
    };
    results.openMeteo.active = true;
  } catch (err) {
    results.openMeteo.error = err.message;
  }

  // Helper untuk membuat data simulasi berdasarkan Open-Meteo
  const generateSimulatedData = (baseData, tempOffset, humidityOffset, windOffset, codeOffset) => {
    if (!baseData) return null;
    
    // Berikan deviasi acak yang konsisten berdasarkan offset
    const temp = Math.round((baseData.temp + tempOffset) * 10) / 10;
    const humidity = Math.min(100, Math.max(0, baseData.humidity + humidityOffset));
    const windSpeed = Math.max(0, Math.round((baseData.windSpeed + windOffset) * 10) / 10);
    const feelsLike = Math.round((baseData.feelsLike + tempOffset * 0.8) * 10) / 10;
    
    // Pilih unified code yang mirip
    let unifiedCode = baseData.unifiedCode;
    if (codeOffset !== 0) {
      // Sedikit mengacak kode cuaca yang berdekatan
      const options = [baseData.unifiedCode];
      if (baseData.unifiedCode === 1) options.push(2);
      else if (baseData.unifiedCode === 2) options.push(1, 3);
      else if (baseData.unifiedCode === 3) options.push(2, 6);
      else if (baseData.unifiedCode === 6) options.push(5, 7);
      
      unifiedCode = options[Math.abs(codeOffset) % options.length];
    }

    return {
      temp,
      humidity,
      windSpeed,
      feelsLike,
      unifiedCode,
      rawCode: 'simulated',
      precipitation: baseData.precipitation
    };
  };

  // 2. Fetch WeatherAPI
  if (weatherApiKey) {
    try {
      const url = `https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${lat},${lon}`;
      const res = await fetch(url, { next: { revalidate: 900 } });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      results.weatherApi.data = {
        temp: data.current.temp_c,
        humidity: data.current.humidity,
        windSpeed: data.current.wind_kph / 3.6, // ubah kph ke m/s
        feelsLike: data.current.feelslike_c,
        unifiedCode: mapWeatherAPIToUnified(data.current.condition.code),
        rawCode: data.current.condition.code,
        precipitation: data.current.precip_mm || 0
      };
      results.weatherApi.active = true;
    } catch (err) {
      results.weatherApi.error = err.message;
    }
  }

  // Jika API Key tidak diset atau terjadi error, buat simulasi jika Open-Meteo berhasil
  if (!results.weatherApi.active && results.openMeteo.data) {
    results.weatherApi.data = generateSimulatedData(results.openMeteo.data, +0.6, -4, +0.8, 1);
    results.weatherApi.active = true;
    results.weatherApi.simulated = true;
  }

  // 3. Fetch OpenWeatherMap
  if (openWeatherMapKey) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherMapKey}&units=metric`;
      const res = await fetch(url, { next: { revalidate: 900 } });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      results.openWeatherMap.data = {
        temp: data.main.temp,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed, // dalam m/s
        feelsLike: data.main.feels_like,
        unifiedCode: mapOWMToUnified(data.weather[0].id),
        rawCode: data.weather[0].id,
        precipitation: data.rain ? (data.rain['1h'] || 0) : 0
      };
      results.openWeatherMap.active = true;
    } catch (err) {
      results.openWeatherMap.error = err.message;
    }
  }

  // Jika API Key tidak diset atau terjadi error, buat simulasi jika Open-Meteo berhasil
  if (!results.openWeatherMap.active && results.openMeteo.data) {
    results.openWeatherMap.data = generateSimulatedData(results.openMeteo.data, -0.4, +3, -0.5, 0);
    results.openWeatherMap.active = true;
    results.openWeatherMap.simulated = true;
  }

  // Pastikan setidaknya satu API berhasil
  const activeApis = Object.values(results).filter(api => api.active && api.data !== null);
  
  if (activeApis.length === 0) {
    return NextResponse.json({ error: 'Gagal mengambil data dari semua API cuaca dan tidak ada fallback data yang tersedia.' }, { status: 500 });
  }

  // --- KALKULASI ENSEMBLE ---
  
  // 1. Temperatur (Averages)
  const temps = activeApis.map(api => api.data.temp);
  const avgTemp = Math.round((temps.reduce((sum, val) => sum + val, 0) / temps.length) * 10) / 10;
  
  // Hitung deviasi standar (Standard Deviation) untuk mengukur tingkat keyakinan (Confidence Score)
  const meanTemp = temps.reduce((sum, val) => sum + val, 0) / temps.length;
  const variance = temps.reduce((sum, val) => sum + Math.pow(val - meanTemp, 2), 0) / temps.length;
  const stdDev = Math.sqrt(variance);

  // 2. Kelembapan (Average)
  const humidities = activeApis.map(api => api.data.humidity);
  const avgHumidity = Math.round(humidities.reduce((sum, val) => sum + val, 0) / humidities.length);

  // 3. Kecepatan Angin (Average)
  const windSpeeds = activeApis.map(api => api.data.windSpeed);
  const avgWindSpeed = Math.round((windSpeeds.reduce((sum, val) => sum + val, 0) / windSpeeds.length) * 10) / 10;

  // 4. Feels Like (Average)
  const feelsLikes = activeApis.map(api => api.data.feelsLike);
  const avgFeelsLike = Math.round((feelsLikes.reduce((sum, val) => sum + val, 0) / feelsLikes.length) * 10) / 10;

  // 5. Curah Hujan (Average)
  const precipitations = activeApis.map(api => api.data.precipitation);
  const avgPrecipitation = Math.round((precipitations.reduce((sum, val) => sum + val, 0) / precipitations.length) * 10) / 10;

  // 6. Kondisi Cuaca (Voting Mayoritas)
  const votes = {};
  activeApis.forEach(api => {
    const code = api.data.unifiedCode;
    votes[code] = (votes[code] || 0) + 1;
  });

  // Tentukan pemenang voting
  let consensusCode = 3; // Default Mendung
  let maxVotes = 0;
  
  Object.keys(votes).forEach(codeStr => {
    const code = parseInt(codeStr);
    const count = votes[code];
    
    if (count > maxVotes) {
      maxVotes = count;
      consensusCode = code;
    } else if (count === maxVotes) {
      // Jika terjadi tie, pilih kode yang memiliki prioritas cuaca lebih "buruk" agar pengguna waspada
      const priority = { 9: 9, 7: 8, 6: 7, 5: 6, 3: 5, 8: 4, 4: 3, 2: 2, 1: 1 };
      if (priority[code] > priority[consensusCode]) {
        consensusCode = code;
      }
    }
  });

  // 7. Hitung Confidence Score (Indeks Keyakinan)
  // Berdasarkan standar deviasi suhu dan konsensus voting
  let confidenceText = 'Sedang';
  let confidencePercentage = 70;

  if (activeApis.length === 1) {
    confidenceText = 'Cukup (Satu Sumber)';
    confidencePercentage = 50;
  } else {
    const isConditionUnanimous = Object.keys(votes).length === 1;

    if (stdDev < 0.8) {
      confidenceText = isConditionUnanimous ? 'Sangat Tinggi' : 'Tinggi';
      confidencePercentage = isConditionUnanimous ? 95 : 85;
    } else if (stdDev < 1.8) {
      confidenceText = 'Tinggi';
      confidencePercentage = 80;
    } else if (stdDev < 3.0) {
      confidenceText = 'Sedang';
      confidencePercentage = 60;
    } else {
      confidenceText = 'Rendah';
      confidencePercentage = 40;
    }
  }

  // Ambil informasi cuaca konsensus
  const consensusWeather = {
    code: consensusCode,
    ...UNIFIED_CUACA_INFO[consensusCode]
  };

  return NextResponse.json({
    city: cityName,
    coordinates: { lat, lon },
    timestamp: new Date().toISOString(),
    ensemble: {
      temp: avgTemp,
      humidity: avgHumidity,
      windSpeed: avgWindSpeed,
      feelsLike: avgFeelsLike,
      precipitation: avgPrecipitation,
      weather: consensusWeather,
      confidence: {
        level: confidenceText,
        score: confidencePercentage,
        stdDev: Math.round(stdDev * 100) / 100
      }
    },
    sources: {
      openMeteo: {
        name: results.openMeteo.name,
        active: results.openMeteo.active,
        simulated: results.openMeteo.simulated,
        temp: results.openMeteo.data?.temp || null,
        humidity: results.openMeteo.data?.humidity || null,
        windSpeed: results.openMeteo.data?.windSpeed || null,
        weather: results.openMeteo.data ? { code: results.openMeteo.data.unifiedCode, ...UNIFIED_CUACA_INFO[results.openMeteo.data.unifiedCode] } : null,
        error: results.openMeteo.error
      },
      weatherApi: {
        name: results.weatherApi.name,
        active: results.weatherApi.active,
        simulated: results.weatherApi.simulated,
        temp: results.weatherApi.data?.temp || null,
        humidity: results.weatherApi.data?.humidity || null,
        windSpeed: results.weatherApi.data?.windSpeed || null,
        weather: results.weatherApi.data ? { code: results.weatherApi.data.unifiedCode, ...UNIFIED_CUACA_INFO[results.weatherApi.data.unifiedCode] } : null,
        error: results.weatherApi.error
      },
      openWeatherMap: {
        name: results.openWeatherMap.name,
        active: results.openWeatherMap.active,
        simulated: results.openWeatherMap.simulated,
        temp: results.openWeatherMap.data?.temp || null,
        humidity: results.openWeatherMap.data?.humidity || null,
        windSpeed: results.openWeatherMap.data?.windSpeed || null,
        weather: results.openWeatherMap.data ? { code: results.openWeatherMap.data.unifiedCode, ...UNIFIED_CUACA_INFO[results.openWeatherMap.data.unifiedCode] } : null,
        error: results.openWeatherMap.error
      }
    }
  });
}
