import { NextResponse } from 'next/server';

// Pemetaan WMO Code (Open-Meteo, GFS, ECMWF, ICON) ke Unified Code
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
    openMeteo: { name: 'Open-Meteo', active: false, simulated: false, data: null, hourly: null, error: null },
    weatherApi: { name: 'WeatherAPI', active: false, simulated: false, data: null, hourly: null, error: null },
    openWeatherMap: { name: 'OpenWeatherMap', active: false, simulated: false, data: null, hourly: null, error: null },
    gfs: { name: 'GFS (NOAA)', active: false, simulated: false, data: null, hourly: null, error: null },
    ecmwf: { name: 'ECMWF (Europe)', active: false, simulated: false, data: null, hourly: null, error: null },
    icon: { name: 'ICON (DWD)', active: false, simulated: false, data: null, hourly: null, error: null }
  };

  // Helper deviasi acak simulasi
  const generateSimulatedPoint = (basePoint, tempOffset, humidityOffset, windOffset, codeOffset) => {
    if (!basePoint) return null;
    const temp = Math.round((basePoint.temp + tempOffset) * 10) / 10;
    const humidity = Math.min(100, Math.max(0, basePoint.humidity + humidityOffset));
    const windSpeed = Math.max(0, Math.round((basePoint.windSpeed + windOffset) * 10) / 10);
    const feelsLike = Math.round((basePoint.feelsLike + tempOffset * 0.8) * 10) / 10;
    
    let unifiedCode = basePoint.unifiedCode;
    if (codeOffset !== 0) {
      const options = [basePoint.unifiedCode];
      if (basePoint.unifiedCode === 1) options.push(2);
      else if (basePoint.unifiedCode === 2) options.push(1, 3);
      else if (basePoint.unifiedCode === 3) options.push(2, 6);
      else if (basePoint.unifiedCode === 6) options.push(5, 7);
      unifiedCode = options[Math.abs(codeOffset) % options.length];
    }

    return {
      temp,
      humidity,
      windSpeed,
      feelsLike,
      unifiedCode,
      rawCode: 'simulated',
      precipitation: basePoint.precipitation
    };
  };

  // --- PARALLEL FETCH UNTUK SEMUA API DAN MODEL ---
  await Promise.all([
    // 1. Open-Meteo
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        if (data.hourly) {
          results.openMeteo.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            unifiedCode: mapWMOToUnified(data.hourly.weather_code[idx]),
            precipitation: data.hourly.precipitation[idx] || 0
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
        const url = `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=${lat},${lon}&days=2`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.weatherApi.data = {
          temp: data.current.temp_c,
          humidity: data.current.humidity,
          windSpeed: data.current.wind_kph / 3.6,
          feelsLike: data.current.feelslike_c,
          unifiedCode: mapWeatherAPIToUnified(data.current.condition.code),
          rawCode: data.current.condition.code,
          precipitation: data.current.precip_mm || 0
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
              unifiedCode: mapWeatherAPIToUnified(hr.condition.code),
              precipitation: hr.precip_mm || 0
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
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${openWeatherMapKey}&units=metric`;
        const currentRes = await fetch(currentUrl, { next: { revalidate: 900 } });
        if (!currentRes.ok) throw new Error(`HTTP ${currentRes.status}`);
        const currentData = await currentRes.json();
        results.openWeatherMap.data = {
          temp: currentData.main.temp,
          humidity: currentData.main.humidity,
          windSpeed: currentData.wind.speed,
          feelsLike: currentData.main.feels_like,
          unifiedCode: mapOWMToUnified(currentData.weather[0].id),
          rawCode: currentData.weather[0].id,
          precipitation: currentData.rain ? (currentData.rain['1h'] || 0) : 0
        };
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${openWeatherMapKey}&units=metric`;
        const forecastRes = await fetch(forecastUrl, { next: { revalidate: 900 } });
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          results.openWeatherMap.hourly = forecastData.list.map(item => ({
            time: item.dt * 1000,
            temp: item.main.temp,
            humidity: item.main.humidity,
            windSpeed: item.wind.speed,
            feelsLike: item.main.feels_like,
            unifiedCode: mapOWMToUnified(item.weather[0].id),
            precipitation: item.rain ? (item.rain['3h'] / 3 || 0) : 0
          }));
        }
        results.openWeatherMap.active = true;
      } catch (err) {
        results.openWeatherMap.error = err.message;
      }
    })(),

    // 4. GFS (NOAA Model)
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/gfs?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.gfs.data = {
          temp: data.current.temperature_2m,
          humidity: data.current.relative_humidity_2m,
          windSpeed: data.current.wind_speed_10m,
          feelsLike: data.current.apparent_temperature,
          unifiedCode: mapWMOToUnified(data.current.weather_code),
          rawCode: data.current.weather_code,
          precipitation: data.current.precipitation || 0
        };
        if (data.hourly) {
          results.gfs.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            unifiedCode: mapWMOToUnified(data.hourly.weather_code[idx]),
            precipitation: data.hourly.precipitation[idx] || 0
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
        const url = `https://api.open-meteo.com/v1/ecmwf?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.ecmwf.data = {
          temp: data.current.temperature_2m,
          humidity: data.current.relative_humidity_2m,
          windSpeed: data.current.wind_speed_10m,
          feelsLike: data.current.apparent_temperature,
          unifiedCode: mapWMOToUnified(data.current.weather_code),
          rawCode: data.current.weather_code,
          precipitation: data.current.precipitation || 0
        };
        if (data.hourly) {
          results.ecmwf.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            unifiedCode: mapWMOToUnified(data.hourly.weather_code[idx]),
            precipitation: data.hourly.precipitation[idx] || 0
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
        const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        results.icon.data = {
          temp: data.current.temperature_2m,
          humidity: data.current.relative_humidity_2m,
          windSpeed: data.current.wind_speed_10m,
          feelsLike: data.current.apparent_temperature,
          unifiedCode: mapWMOToUnified(data.current.weather_code),
          rawCode: data.current.weather_code,
          precipitation: data.current.precipitation || 0
        };
        if (data.hourly) {
          results.icon.hourly = data.hourly.time.map((t, idx) => ({
            time: new Date(t).getTime(),
            temp: data.hourly.temperature_2m[idx],
            humidity: data.hourly.relative_humidity_2m[idx],
            windSpeed: data.hourly.wind_speed_10m[idx],
            feelsLike: data.hourly.apparent_temperature[idx],
            unifiedCode: mapWMOToUnified(data.hourly.weather_code[idx]),
            precipitation: data.hourly.precipitation[idx] || 0
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
    results.weatherApi.data = generateSimulatedPoint(results.openMeteo.data, +0.6, -4, +0.8, 1);
    if (results.openMeteo.hourly) {
      results.weatherApi.hourly = results.openMeteo.hourly.map(p => ({
        time: p.time,
        ...generateSimulatedPoint(p, +0.6, -4, +0.8, 1)
      }));
    }
    results.weatherApi.active = true;
    results.weatherApi.simulated = true;
  }

  if (!results.openWeatherMap.active && results.openMeteo.data) {
    results.openWeatherMap.data = generateSimulatedPoint(results.openMeteo.data, -0.4, +3, -0.5, 0);
    if (results.openMeteo.hourly) {
      results.openWeatherMap.hourly = results.openMeteo.hourly.map(p => ({
        time: p.time,
        ...generateSimulatedPoint(p, -0.4, +3, -0.5, 0)
      }));
    }
    results.openWeatherMap.active = true;
    results.openWeatherMap.simulated = true;
  }

  // Cari API/Model yang berhasil dimuat
  const activeApis = Object.values(results).filter(api => api.active && api.data !== null);
  
  if (activeApis.length === 0) {
    return NextResponse.json({ error: 'Gagal mengambil data cuaca dari semua sumber.' }, { status: 500 });
  }

  // --- KALKULASI ENSEMBLE KONSENSUS SEKARANG ---
  const temps = activeApis.map(api => api.data.temp);
  const avgTemp = Math.round((temps.reduce((sum, val) => sum + val, 0) / temps.length) * 10) / 10;
  
  const meanTemp = temps.reduce((sum, val) => sum + val, 0) / temps.length;
  const variance = temps.reduce((sum, val) => sum + Math.pow(val - meanTemp, 2), 0) / temps.length;
  const stdDev = Math.sqrt(variance);

  const avgHumidity = Math.round(activeApis.map(api => api.data.humidity).reduce((sum, val) => sum + val, 0) / activeApis.length);
  const avgWindSpeed = Math.round((activeApis.map(api => api.data.windSpeed).reduce((sum, val) => sum + val, 0) / activeApis.length) * 10) / 10;
  const avgFeelsLike = Math.round((activeApis.map(api => api.data.feelsLike).reduce((sum, val) => sum + val, 0) / activeApis.length) * 10) / 10;
  const avgPrecipitation = Math.round((activeApis.map(api => api.data.precipitation).reduce((sum, val) => sum + val, 0) / activeApis.length) * 10) / 10;

  // Voting Cuaca Sekarang
  const votes = {};
  activeApis.forEach(api => {
    const code = api.data.unifiedCode;
    votes[code] = (votes[code] || 0) + 1;
  });
  let consensusCode = 3;
  let maxVotes = 0;
  Object.keys(votes).forEach(codeStr => {
    const code = parseInt(codeStr);
    const count = votes[code];
    if (count > maxVotes) {
      maxVotes = count;
      consensusCode = code;
    } else if (count === maxVotes) {
      const priority = { 9: 9, 7: 8, 6: 7, 5: 6, 3: 5, 8: 4, 4: 3, 2: 2, 1: 1 };
      if (priority[code] > priority[consensusCode]) consensusCode = code;
    }
  });

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

  // --- PEMBUATAN PREDIKSI FORECAST PER 3 JAM (24 JAM KE DEPAN) ---
  const forecastPoints = [];
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

    const omPoint = findClosestPoint(results.openMeteo.hourly);
    const waPoint = findClosestPoint(results.weatherApi.hourly);
    const owmPoint = findClosestPoint(results.openWeatherMap.hourly);
    const gfsPoint = findClosestPoint(results.gfs.hourly);
    const ecmwfPoint = findClosestPoint(results.ecmwf.hourly);
    const iconPoint = findClosestPoint(results.icon.hourly);

    const apisForPoint = [];
    if (omPoint) apisForPoint.push({ name: 'openMeteo', data: omPoint });
    if (waPoint) apisForPoint.push({ name: 'weatherApi', data: waPoint });
    if (owmPoint) apisForPoint.push({ name: 'openWeatherMap', data: owmPoint });
    if (gfsPoint) apisForPoint.push({ name: 'gfs', data: gfsPoint });
    if (ecmwfPoint) apisForPoint.push({ name: 'ecmwf', data: ecmwfPoint });
    if (iconPoint) apisForPoint.push({ name: 'icon', data: iconPoint });

    if (apisForPoint.length > 0) {
      const tempsAtPoint = apisForPoint.map(a => a.data.temp);
      const avgTempAtPoint = Math.round((tempsAtPoint.reduce((sum, v) => sum + v, 0) / tempsAtPoint.length) * 10) / 10;
      
      const humiditiesAtPoint = apisForPoint.map(a => a.data.humidity);
      const avgHumAtPoint = Math.round(humiditiesAtPoint.reduce((sum, v) => sum + v, 0) / humiditiesAtPoint.length);

      const windSpeedsAtPoint = apisForPoint.map(a => a.data.windSpeed);
      const avgWindAtPoint = Math.round((windSpeedsAtPoint.reduce((sum, v) => sum + v, 0) / windSpeedsAtPoint.length) * 10) / 10;

      // Voting cuaca
      const votesAtPoint = {};
      apisForPoint.forEach(a => {
        const code = a.data.unifiedCode;
        votesAtPoint[code] = (votesAtPoint[code] || 0) + 1;
      });
      let consensusCodeAtPoint = 3;
      let maxVotesAtPoint = 0;
      Object.keys(votesAtPoint).forEach(codeStr => {
        const code = parseInt(codeStr);
        const count = votesAtPoint[code];
        if (count > maxVotesAtPoint) {
          maxVotesAtPoint = count;
          consensusCodeAtPoint = code;
        } else if (count === maxVotesAtPoint) {
          const priority = { 9: 9, 7: 8, 6: 7, 5: 6, 3: 5, 8: 4, 4: 3, 2: 2, 1: 1 };
          if (priority[code] > priority[consensusCodeAtPoint]) consensusCodeAtPoint = code;
        }
      });

      const hourStr = targetTime.getHours().toString().padStart(2, '0') + ':00';
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const dateStr = `${dayNames[targetTime.getDay()]}, ${targetTime.getDate()} ${monthNames[targetTime.getMonth()]}`;

      forecastPoints.push({
        time: targetTime.toISOString(),
        displayTime: hourStr,
        displayDate: dateStr,
        temp: avgTempAtPoint,
        humidity: avgHumAtPoint,
        windSpeed: avgWindAtPoint,
        weather: {
          code: consensusCodeAtPoint,
          ...UNIFIED_CUACA_INFO[consensusCodeAtPoint]
        },
        sources: {
          openMeteo: omPoint ? { temp: omPoint.temp, code: omPoint.unifiedCode, icon: UNIFIED_CUACA_INFO[omPoint.unifiedCode].icon } : null,
          weatherApi: waPoint ? { temp: waPoint.temp, code: waPoint.unifiedCode, icon: UNIFIED_CUACA_INFO[waPoint.unifiedCode].icon } : null,
          openWeatherMap: owmPoint ? { temp: owmPoint.temp, code: owmPoint.unifiedCode, icon: UNIFIED_CUACA_INFO[owmPoint.unifiedCode].icon } : null,
          gfs: gfsPoint ? { temp: gfsPoint.temp, code: gfsPoint.unifiedCode, icon: UNIFIED_CUACA_INFO[gfsPoint.unifiedCode].icon } : null,
          ecmwf: ecmwfPoint ? { temp: ecmwfPoint.temp, code: ecmwfPoint.unifiedCode, icon: UNIFIED_CUACA_INFO[ecmwfPoint.unifiedCode].icon } : null,
          icon: iconPoint ? { temp: iconPoint.temp, code: iconPoint.unifiedCode, icon: UNIFIED_CUACA_INFO[iconPoint.unifiedCode].icon } : null
        }
      });
    }
  }

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
      weather: {
        code: consensusCode,
        ...UNIFIED_CUACA_INFO[consensusCode]
      },
      confidence: {
        level: confidenceText,
        score: confidencePercentage,
        stdDev: Math.round(stdDev * 100) / 100
      }
    },
    forecast: forecastPoints,
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
      },
      gfs: {
        name: results.gfs.name,
        active: results.gfs.active,
        simulated: results.gfs.simulated,
        temp: results.gfs.data?.temp || null,
        humidity: results.gfs.data?.humidity || null,
        windSpeed: results.gfs.data?.windSpeed || null,
        weather: results.gfs.data ? { code: results.gfs.data.unifiedCode, ...UNIFIED_CUACA_INFO[results.gfs.data.unifiedCode] } : null,
        error: results.gfs.error
      },
      ecmwf: {
        name: results.ecmwf.name,
        active: results.ecmwf.active,
        simulated: results.ecmwf.simulated,
        temp: results.ecmwf.data?.temp || null,
        humidity: results.ecmwf.data?.humidity || null,
        windSpeed: results.ecmwf.data?.windSpeed || null,
        weather: results.ecmwf.data ? { code: results.ecmwf.data.unifiedCode, ...UNIFIED_CUACA_INFO[results.ecmwf.data.unifiedCode] } : null,
        error: results.ecmwf.error
      },
      icon: {
        name: results.icon.name,
        active: results.icon.active,
        simulated: results.icon.simulated,
        temp: results.icon.data?.temp || null,
        humidity: results.icon.data?.humidity || null,
        windSpeed: results.icon.data?.windSpeed || null,
        weather: results.icon.data ? { code: results.icon.data.unifiedCode, ...UNIFIED_CUACA_INFO[results.icon.data.unifiedCode] } : null,
        error: results.icon.error
      }
    }
  });
}
