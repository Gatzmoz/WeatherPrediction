'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudLightning, Snowflake,
  Search, X, MapPin, Thermometer, Droplets, Wind, Percent, HelpCircle, AlertTriangle, Gauge,
  Database, Table
} from 'lucide-react';
import styles from './page.module.css';
import EnsembleChart from '../components/EnsembleChart';

// Map icon string to Lucide Icon Component
const IconMap = {
  Sun: Sun,
  CloudSun: CloudSun,
  Cloud: Cloud,
  CloudFog: CloudFog,
  CloudDrizzle: CloudDrizzle,
  CloudRain: CloudRain,
  CloudLightning: CloudLightning,
  Snowflake: Snowflake
};

const CUACA_INFO_MAP = {
  'Cerah': { label: 'Cerah', icon: 'Sun' },
  'Cerah Berawan': { label: 'Cerah Berawan', icon: 'CloudSun' },
  'Berawan': { label: 'Berawan', icon: 'Cloud' },
  'Hujan Ringan': { label: 'Hujan Ringan', icon: 'CloudDrizzle' },
  'Hujan Sedang': { label: 'Hujan Sedang', icon: 'CloudRain' },
  'Hujan Lebat': { label: 'Hujan Lebat', icon: 'CloudLightning' }
};

const WeatherIcon = ({ iconName, size = 24, ...props }) => {
  const IconComponent = IconMap[iconName] || Cloud;
  return <IconComponent size={size} {...props} />;
};

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [weatherData, setWeatherData] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [weatherError, setWeatherError] = useState(null);
  
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [storyImageUrl, setStoryImageUrl] = useState('');
  
  // Default ke Jakarta
  const [selectedCity, setSelectedCity] = useState({
    name: 'Jakarta',
    country: 'Indonesia',
    latitude: -6.2146,
    longitude: 106.8451,
    adm4: null
  });

  const [activeTableTab, setActiveTableTab] = useState('continuous');

  // States untuk selector wilayah administratif berjenjang
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);

  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedRegency, setSelectedRegency] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('');

  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingRegencies, setLoadingRegencies] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);

  const searchRef = useRef(null);
  const debounceTimer = useRef(null);

  // Efek klik di luar dropdown untuk menutup suggestions
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSuggestions([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mengambil posisi GPS secara otomatis saat pertama kali dimuat
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const revRes = await fetch(`/api/regions?lat=${latitude}&lon=${longitude}`);
            if (revRes.ok) {
              const data = await revRes.json();
              setSelectedProvince(data.province.code);
              setSelectedRegency(data.regency.code);
              setSelectedDistrict(data.district.code);
              setSelectedVillage(data.village.code);
              
              const [regenciesList, districtsList, villagesList] = await Promise.all([
                fetch(`/api/regions?level=regency&parent=${data.province.code}`).then(res => res.json()),
                fetch(`/api/regions?level=district&parent=${data.regency.code}`).then(res => res.json()),
                fetch(`/api/regions?level=village&parent=${data.district.code}`).then(res => res.json())
              ]);
              setRegencies(regenciesList);
              setDistricts(districtsList);
              setVillages(villagesList);

              setSelectedCity({
                name: data.village.name,
                country: `${data.district.name}, ${data.regency.name}, ${data.province.name}`,
                latitude: latitude,
                longitude: longitude,
                adm4: data.village.code
              });
            } else {
              setSelectedCity({
                name: 'Lokasi Anda (GPS)',
                country: 'Koordinat Perangkat',
                latitude: latitude,
                longitude: longitude,
                adm4: null
              });
            }
          } catch (e) {
            setSelectedCity({
              name: 'Lokasi Anda (GPS)',
              country: 'Koordinat Perangkat',
              latitude: latitude,
              longitude: longitude,
              adm4: null
            });
          }
        },
        (error) => {
          console.log('GPS auto-mount access failed or denied:', error.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
  }, []);

  // Ambil list Provinsi di awal
  useEffect(() => {
    async function loadProvinces() {
      setLoadingProvinces(true);
      try {
        const res = await fetch('/api/regions?level=province');
        if (res.ok) {
          const data = await res.json();
          setProvinces(data);
        }
      } catch (err) {
        console.error('Error loading provinces:', err);
      } finally {
        setLoadingProvinces(false);
      }
    }
    loadProvinces();
  }, []);

  // Ambil data cuaca saat kota terpilih berubah
  useEffect(() => {
    async function fetchWeather() {
      setLoadingWeather(true);
      setWeatherError(null);
      try {
        let url = `/api/weather?lat=${selectedCity.latitude}&lon=${selectedCity.longitude}&city=${encodeURIComponent(selectedCity.name)}`;
        if (selectedCity.adm4) {
          url = `/api/weather?adm4=${selectedCity.adm4}&city=${encodeURIComponent(selectedCity.name)}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Gagal mengambil data cuaca dari server.');
        }
        const data = await response.json();
        setWeatherData(data);

        // Perbarui warna latar belakang tema secara dinamis
        const themeColor = data.ensemble.weather.color || 'partly-cloudy';
        document.documentElement.style.setProperty('--active-theme', `var(--theme-${themeColor})`);
      } catch (err) {
        setWeatherError(err.message);
      } finally {
        setLoadingWeather(false);
      }
    }

    fetchWeather();
  }, [selectedCity]);

  // Handler input pencarian dengan debouncing (Gabungan Global & Kelurahan Indonesia)
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setLoadingSuggestions(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        // Fetch hasil global
        const globalPromise = fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=5&language=id&format=json`
        ).then(res => res.ok ? res.json() : { results: [] });

        // Fetch hasil lokal kelurahan
        const localPromise = fetch(
          `/api/regions?search=${encodeURIComponent(value)}`
        ).then(res => res.ok ? res.json() : []);

        const [globalData, localData] = await Promise.all([globalPromise, localPromise]);

        const combined = [];
        if (globalData.results && globalData.results.length > 0) {
          globalData.results.forEach(item => {
            combined.push({
              type: 'global',
              id: item.id,
              name: item.name,
              country: item.country || item.admin1 || '',
              latitude: item.latitude,
              longitude: item.longitude
            });
          });
        }
        if (localData && localData.length > 0) {
          localData.forEach(item => {
            combined.push({
              type: 'local',
              id: item.code,
              name: item.name,
              country: `${item.district}, ${item.regency}, ${item.province}`,
              code: item.code
            });
          });
        }

        setSuggestions(combined);
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 450);
  };

  // Pilih kota dari dropdown suggestions
  const handleSelectCity = (city) => {
    if (city.type === 'local') {
      setSelectedCity({
        name: city.name,
        country: city.country,
        latitude: 0,
        longitude: 0,
        adm4: city.code
      });
    } else {
      setSelectedCity({
        name: city.name,
        country: city.country || '',
        latitude: city.latitude,
        longitude: city.longitude,
        adm4: null
      });
    }
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
  };

  // Handler GPS manual untuk mengambil posisi pengguna
  const handleGpsFetch = () => {
    if (!navigator.geolocation) {
      alert('Fitur GPS tidak didukung oleh browser Anda.');
      return;
    }
    
    setLoadingWeather(true);
    setWeatherError(null);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const revRes = await fetch(`/api/regions?lat=${latitude}&lon=${longitude}`);
          if (revRes.ok) {
            const data = await revRes.json();
            setSelectedProvince(data.province.code);
            setSelectedRegency(data.regency.code);
            setSelectedDistrict(data.district.code);
            setSelectedVillage(data.village.code);
            
            const [regenciesList, districtsList, villagesList] = await Promise.all([
              fetch(`/api/regions?level=regency&parent=${data.province.code}`).then(res => res.json()),
              fetch(`/api/regions?level=district&parent=${data.regency.code}`).then(res => res.json()),
              fetch(`/api/regions?level=village&parent=${data.district.code}`).then(res => res.json())
            ]);
            setRegencies(regenciesList);
            setDistricts(districtsList);
            setVillages(villagesList);

            setSelectedCity({
              name: data.village.name,
              country: `${data.district.name}, ${data.regency.name}, ${data.province.name}`,
              latitude: latitude,
              longitude: longitude,
              adm4: data.village.code
            });
          } else {
            setSelectedCity({
              name: 'Lokasi Anda (GPS)',
              country: 'Koordinat Perangkat',
              latitude: latitude,
              longitude: longitude,
              adm4: null
            });
          }
        } catch (e) {
          setSelectedCity({
            name: 'Lokasi Anda (GPS)',
            country: 'Koordinat Perangkat',
            latitude: latitude,
            longitude: longitude,
            adm4: null
          });
        }
      },
      (error) => {
        setLoadingWeather(false);
        let msg = 'Gagal mengakses GPS.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Akses GPS ditolak oleh pengguna.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Informasi posisi tidak tersedia.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Waktu permintaan GPS habis.';
        }
        alert(msg + ' Menggunakan lokasi default (Jakarta).');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Handler Eksport gambar ke Instagram Story (Upgraded Premium Design)
  const generateInstagramStory = () => {
    if (!weatherData) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // 1. Background Gradient & Decorative Glowing Blobs
    const color = weatherData.ensemble.weather.color || 'partly-cloudy';
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    
    if (color === 'sunny') {
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e3a8a');
      grad.addColorStop(1, '#f59e0b');
    } else if (color === 'rainy' || color === 'heavy-rain') {
      grad.addColorStop(0, '#05070c');
      grad.addColorStop(0.6, '#0f172a');
      grad.addColorStop(1, '#1d4ed8');
    } else if (color === 'drizzle') {
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.6, '#0f172a');
      grad.addColorStop(1, '#0d9488');
    } else if (color === 'thunderstorm') {
      grad.addColorStop(0, '#05070c');
      grad.addColorStop(0.6, '#1e1b4b');
      grad.addColorStop(1, '#7c3aed');
    } else {
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.6, '#1e293b');
      grad.addColorStop(1, '#38bdf8');
    }
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    const drawGlowBlob = (cx, cy, r, c1, c2) => {
      ctx.save();
      const radial = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
      radial.addColorStop(0, c1);
      radial.addColorStop(1, c2);
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    if (color === 'sunny') {
      drawGlowBlob(200, 400, 450, 'rgba(245, 158, 11, 0.18)', 'rgba(245, 158, 11, 0)');
      drawGlowBlob(880, 1550, 500, 'rgba(29, 78, 216, 0.22)', 'rgba(29, 78, 216, 0)');
    } else if (color === 'rainy' || color === 'heavy-rain' || color === 'thunderstorm') {
      drawGlowBlob(150, 350, 450, 'rgba(59, 130, 246, 0.15)', 'rgba(59, 130, 246, 0)');
      drawGlowBlob(900, 1500, 550, 'rgba(99, 102, 241, 0.18)', 'rgba(99, 102, 241, 0)');
    } else {
      drawGlowBlob(200, 350, 450, 'rgba(56, 189, 248, 0.18)', 'rgba(56, 189, 248, 0)');
      drawGlowBlob(880, 1500, 500, 'rgba(30, 41, 59, 0.3)', 'rgba(30, 41, 59, 0)');
    }

    // 2. Drawing helpers
    const wrapText = (cText, x, y, maxWidth, lineHeight, maxLines = 2) => {
      const words = cText.split(' ');
      let line = '';
      let lines = [];
      
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());
      
      const linesToDraw = lines.slice(0, maxLines);
      linesToDraw.forEach((lineText, index) => {
        ctx.fillText(lineText, x, y + index * lineHeight);
      });
      return linesToDraw.length;
    };

    const drawWeatherIcon = (cx, cy, scale, iconName) => {
      ctx.save();
      
      const drawSun = (x, y, r) => {
        ctx.save();
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20 * scale;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.restore();
        
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = Math.max(2.5, 5.5 * scale);
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const startX = x + Math.cos(angle) * (r + 7 * scale);
          const startY = y + Math.sin(angle) * (r + 7 * scale);
          const endX = x + Math.cos(angle) * (r + 17 * scale);
          const endY = y + Math.sin(angle) * (r + 17 * scale);
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      };

      const drawCloud = (x, y, sc, cloudColor = '#f8fafc') => {
        ctx.save();
        ctx.fillStyle = cloudColor;
        ctx.beginPath();
        ctx.arc(x - 20 * sc, y + 10 * sc, 20 * sc, 0, Math.PI * 2);
        ctx.arc(x + 20 * sc, y + 10 * sc, 16 * sc, 0, Math.PI * 2);
        ctx.arc(x, y - 10 * sc, 26 * sc, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.rect(x - 20 * sc, y, 40 * sc, 25 * sc);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      const drawRain = (x, y, isHeavy = false) => {
        drawCloud(x, y - 8 * scale, scale, '#94a3b8');
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(2, 4.5 * scale);
        ctx.lineCap = 'round';
        
        const offsets = isHeavy ? [-15 * scale, 0, 15 * scale] : [-8 * scale, 8 * scale];
        offsets.forEach(offset => {
          ctx.beginPath();
          ctx.moveTo(x + offset, y + 10 * scale);
          ctx.lineTo(x + offset - 4 * scale, y + 26 * scale);
          ctx.stroke();
        });
      };

      const drawThunder = (x, y) => {
        drawCloud(x, y - 8 * scale, scale, '#475569');
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(x - 4 * scale, y + 10 * scale);
        ctx.lineTo(x + 8 * scale, y + 10 * scale);
        ctx.lineTo(x, y + 22 * scale);
        ctx.lineTo(x + 12 * scale, y + 22 * scale);
        ctx.lineTo(x - 8 * scale, y + 38 * scale);
        ctx.lineTo(x - 2 * scale, y + 24 * scale);
        ctx.lineTo(x - 8 * scale, y + 24 * scale);
        ctx.closePath();
        ctx.fill();
      };

      if (iconName === 'Sun') {
        drawSun(cx, cy, 25 * scale);
      } else if (iconName === 'CloudSun') {
        drawSun(cx - 14 * scale, cy - 12 * scale, 18 * scale);
        drawCloud(cx + 8 * scale, cy + 8 * scale, 0.85 * scale, 'rgba(255, 255, 255, 0.95)');
      } else if (iconName === 'Cloud' || iconName === 'CloudFog') {
        drawCloud(cx, cy, scale, '#f8fafc');
      } else if (iconName === 'CloudDrizzle') {
        drawRain(cx, cy, false);
      } else if (iconName === 'CloudRain' || iconName === 'Snowflake') {
        drawRain(cx, cy, true);
      } else if (iconName === 'CloudLightning') {
        drawThunder(cx, cy);
      } else {
        drawCloud(cx, cy, scale, '#f8fafc');
      }

      ctx.restore();
    };

    const drawThermometer = (x, y) => {
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.fillStyle = '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 2.5, y + 6);
      ctx.lineTo(x - 2.5, y - 10);
      ctx.arc(x, y - 10, 2.5, Math.PI, 0);
      ctx.lineTo(x + 2.5, y + 6);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(x, y + 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(x - 1, y, 2, 7);
      ctx.fill();
      ctx.restore();
    };

    const drawWindLines = (x, y) => {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 4);
      ctx.lineTo(x + 4, y - 4);
      ctx.arc(x + 4, y - 8, 4, Math.PI / 2, (3 * Math.PI) / 2, true);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 3);
      ctx.lineTo(x + 8, y + 3);
      ctx.arc(x + 8, y + 7, 4, (3 * Math.PI) / 2, Math.PI / 2, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 10);
      ctx.lineTo(x + 2, y + 10);
      ctx.stroke();
      ctx.restore();
    };

    const drawDroplet = (x, y) => {
      ctx.save();
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.bezierCurveTo(x - 9, y - 3, x - 9, y + 5, x, y + 11);
      ctx.bezierCurveTo(x + 9, y + 5, x + 9, y - 3, x, y - 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(x - 2.5, y + 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawRainDrops = (x, y) => {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x - 9, y + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 6);
      ctx.lineTo(x + 1, y + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 1, y + 2);
      ctx.lineTo(x - 4, y + 12);
      ctx.stroke();
      ctx.restore();
    };

    // 3. Draw Watermark Header
    ctx.font = '800 36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('ENSEMBLE WEATHER FORECAST', 540, 150);

    // 4. Main Glassmorphic Card (Current consensus)
    const cardX = 90;
    const cardY = 220;
    const cardW = 900;
    const cardH = 920;
    const cardRadius = 60;

    // Card background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.beginPath();
    ctx.moveTo(cardX + cardRadius, cardY);
    ctx.lineTo(cardX + cardW - cardRadius, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + cardRadius);
    ctx.lineTo(cardX + cardW, cardY + cardH - cardRadius);
    ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - cardRadius, cardY + cardH);
    ctx.lineTo(cardX + cardRadius, cardY + cardH);
    ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - cardRadius);
    ctx.lineTo(cardX, cardY + cardRadius);
    ctx.quadraticCurveTo(cardX, cardY, cardX + cardRadius, cardY);
    ctx.closePath();
    ctx.fill();

    // Card premium gradient border
    const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.12)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title (City Name) - Dynamic size to prevent clipping!
    ctx.fillStyle = '#ffffff';
    let cityFontSize = 68;
    ctx.font = `800 ${cityFontSize}px system-ui, -apple-system, sans-serif`;
    while (ctx.measureText(weatherData.city.toUpperCase()).width > 780 && cityFontSize > 32) {
      cityFontSize -= 2;
      ctx.font = `800 ${cityFontSize}px system-ui, -apple-system, sans-serif`;
    }
    ctx.fillText(weatherData.city.toUpperCase(), 540, 340);

    // Subtitle (Country/Location) - Wrapped to 2 lines if needed!
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 28px system-ui, -apple-system, sans-serif';
    const subtitleText = `${selectedCity.country} (${weatherData.timezone_abbreviation || 'WIB'})`;
    wrapText(subtitleText, 540, 390, 780, 36, 2);

    // Consensus Main Weather Icon
    drawWeatherIcon(540, 530, 2.2, weatherData.ensemble.weather.icon);

    // Consensus Temperature
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 170px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${weatherData.ensemble.temp}°C`, 540, 720);

    // Consensus Weather Label & Percentage
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 44px system-ui, -apple-system, sans-serif';
    const pctStr = weatherData.ensemble.weather.percentage !== undefined ? ` (${weatherData.ensemble.weather.percentage}%)` : '';
    ctx.fillText(`${weatherData.ensemble.weather.label}${pctStr}`, 540, 800);

    // Parameters Grid Box (Inner Frosted Card)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(cardX + 60, 860, cardW - 120, 210);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeRect(cardX + 60, 860, cardW - 120, 210);

    // Grid divider lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(540, 860);
    ctx.lineTo(540, 1070);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(180, 965);
    ctx.lineTo(900, 965);
    ctx.stroke();

    ctx.textAlign = 'left';

    // Q1: Sensasi Termal
    drawThermometer(210, 915);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Sensasi', 240, 905);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${weatherData.ensemble.feelsLike}°C`, 240, 942);

    // Q2: Kecepatan Angin
    drawWindLines(610, 915);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Angin', 640, 905);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${weatherData.ensemble.windSpeed} m/s`, 640, 942);

    // Q3: Kelembapan
    drawDroplet(210, 1015);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Kelembapan', 240, 1005);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${weatherData.ensemble.humidity}%`, 240, 1042);

    // Q4: Curah Hujan
    drawRainDrops(610, 1015);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Curah Hujan', 640, 1005);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${weatherData.ensemble.precipitation} mm`, 640, 1042);

    ctx.textAlign = 'center';

    // 5. Forecast Glassmorphic Card (24h Forecast)
    const fCardX = 90;
    const fCardY = 1200;
    const fCardW = 900;
    const fCardH = 580;
    const fCardRadius = 45;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.beginPath();
    ctx.moveTo(fCardX + fCardRadius, fCardY);
    ctx.lineTo(fCardX + fCardW - fCardRadius, fCardY);
    ctx.quadraticCurveTo(fCardX + fCardW, fCardY, fCardX + fCardW, fCardY + fCardRadius);
    ctx.lineTo(fCardX + fCardW, fCardY + fCardH - fCardRadius);
    ctx.quadraticCurveTo(fCardX + fCardW, fCardY + fCardH, fCardX + fCardW - fCardRadius, fCardY + fCardH);
    ctx.lineTo(fCardX + fCardRadius, fCardY + fCardH);
    ctx.quadraticCurveTo(fCardX, fCardY + fCardH, fCardX, fCardY + fCardH - fCardRadius);
    ctx.lineTo(fCardX, fCardY + fCardRadius);
    ctx.quadraticCurveTo(fCardX, fCardY, fCardX + fCardRadius, fCardY);
    ctx.closePath();
    ctx.fill();

    const fBorderGrad = ctx.createLinearGradient(fCardX, fCardY, fCardX + fCardW, fCardY + fCardH);
    fBorderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    fBorderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    fBorderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
    ctx.strokeStyle = fBorderGrad;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Section Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 38px system-ui, -apple-system, sans-serif';
    ctx.fillText('PRAKIRAAN CUACA 24 JAM', 540, 1270);

    // Columns
    if (weatherData.forecast && weatherData.forecast.length >= 4) {
      const cols = weatherData.forecast.slice(0, 4);
      const startX = 170;
      const colStep = 245;

      cols.forEach((col, idx) => {
        const x = startX + idx * colStep;
        
        // Time
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 34px system-ui, -apple-system, sans-serif';
        ctx.fillText(col.displayTime, x, 1345);

        // Date
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 24px system-ui, -apple-system, sans-serif';
        ctx.fillText(col.displayDate, x, 1390);

        // Small Vector Icon
        drawWeatherIcon(x, 1465, 0.75, col.weather.icon);

        // Temperature
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 48px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${col.temp}°C`, x, 1540);

        // StdDev
        if (col.temp_stddev !== undefined) {
          ctx.fillStyle = col.temp_stddev > 2 ? '#fbbf24' : '#34d399';
          ctx.font = '700 22px system-ui, -apple-system, sans-serif';
          ctx.fillText(`±${col.temp_stddev.toFixed(1)}`, x, 1590);
        }

        // Weather Label - Dynamic size to prevent column overlap!
        ctx.fillStyle = '#38bdf8';
        let labelSize = 25;
        ctx.font = `700 ${labelSize}px system-ui, -apple-system, sans-serif`;
        while (ctx.measureText(col.weather.label).width > 220 && labelSize > 16) {
          labelSize -= 1;
          ctx.font = `700 ${labelSize}px system-ui, -apple-system, sans-serif`;
        }
        ctx.fillText(col.weather.label, x, 1650);

        // Percentage
        ctx.fillStyle = '#34d399';
        ctx.font = '700 23px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${col.weather.percentage}%`, x, 1695);
      });
    }

    // 6. Footer Watermark
    ctx.fillStyle = '#64748b';
    ctx.font = '600 26px system-ui, -apple-system, sans-serif';
    ctx.fillText('dihasilkan oleh Ensemble Weather App', 540, 1850);

    const dataUrl = canvas.toDataURL('image/png');
    setStoryImageUrl(dataUrl);
    setShowStoryModal(true);
  };

  // Handler dropdown manual berjenjang
  const handleProvinceChange = async (e) => {
    const code = e.target.value;
    setSelectedProvince(code);
    setSelectedRegency('');
    setSelectedDistrict('');
    setSelectedVillage('');
    setRegencies([]);
    setDistricts([]);
    setVillages([]);

    if (!code) return;

    setLoadingRegencies(true);
    try {
      const res = await fetch(`/api/regions?level=regency&parent=${code}`);
      if (res.ok) {
        const data = await res.json();
        setRegencies(data);
      }
    } catch (err) {
      console.error('Error loading regencies:', err);
    } finally {
      setLoadingRegencies(false);
    }
  };

  const handleRegencyChange = async (e) => {
    const code = e.target.value;
    setSelectedRegency(code);
    setSelectedDistrict('');
    setSelectedVillage('');
    setDistricts([]);
    setVillages([]);

    if (!code) return;

    setLoadingDistricts(true);
    try {
      const res = await fetch(`/api/regions?level=district&parent=${code}`);
      if (res.ok) {
        const data = await res.json();
        setDistricts(data);
      }
    } catch (err) {
      console.error('Error loading districts:', err);
    } finally {
      setLoadingDistricts(false);
    }
  };

  const handleDistrictChange = async (e) => {
    const code = e.target.value;
    setSelectedDistrict(code);
    setSelectedVillage('');
    setVillages([]);

    if (!code) return;

    setLoadingVillages(true);
    try {
      const res = await fetch(`/api/regions?level=village&parent=${code}`);
      if (res.ok) {
        const data = await res.json();
        setVillages(data);
      }
    } catch (err) {
      console.error('Error loading villages:', err);
    } finally {
      setLoadingVillages(false);
    }
  };

  const handleVillageChange = (e) => {
    const code = e.target.value;
    setSelectedVillage(code);

    if (!code) return;

    const village = villages.find(v => v.code === code);
    const districtName = districts.find(d => d.code === selectedDistrict)?.name || '';
    const regencyName = regencies.find(r => r.code === selectedRegency)?.name || '';
    const provinceName = provinces.find(p => p.code === selectedProvince)?.name || '';

    if (village) {
      setSelectedCity({
        name: village.name,
        country: `${districtName}, ${regencyName}, ${provinceName}`,
        latitude: 0,
        longitude: 0,
        adm4: code
      });
    }
  };

  // Navigasi keyboard di dropdown suggestions
  const handleKeyDown = (e) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        handleSelectCity(suggestions[activeSuggestionIndex]);
      }
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
    }
  };

  // Ambil badge CSS class berdasarkan tingkat keyakinan
  const getConfidenceClass = (level) => {
    if (!level) return '';
    const lvl = level.toLowerCase();
    if (lvl.includes('sangat tinggi')) return styles['conf-sangat-tinggi'];
    if (lvl.includes('tinggi')) return styles['conf-tinggi'];
    if (lvl.includes('sedang')) return styles['conf-sedang'];
    return styles['conf-rendah'];
  };

  // Cek apakah ada API yang disimulasikan
  const hasSimulatedData = weatherData && 
    Object.values(weatherData.sources).some(source => source.simulated);

  return (
    <div className={styles.page}>
      
      {/* Header Halaman */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Sun size={38} className={styles.titleIcon} />
          <h1 className={styles.title}>Ensemble Weather</h1>
        </div>
        <p className={styles.subtitle}>
          Sistem prakiraan cuaca berbasis konsensus. Menggabungkan data real-time dari 
          <strong> Open-Meteo</strong>, <strong>WeatherAPI</strong>, dan <strong>OpenWeatherMap</strong> untuk hasil prediksi yang lebih akurat dan minim bias.
        </p>
      </header>

      {/* Bagian Pencarian Kota */}
      <section className={styles.searchSection} ref={searchRef}>
        <div className={styles.searchInputWrapper}>
          <Search className={styles.searchIcon} size={20} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Cari Kota (Contoh: Surabaya, Tokyo, London...)"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
          />
          <button 
            type="button" 
            className={styles.gpsButton} 
            onClick={handleGpsFetch}
            title="Gunakan Lokasi Saat Ini (GPS)"
            style={{
              right: searchQuery ? '3.25rem' : '1.25rem'
            }}
          >
            <MapPin size={18} />
          </button>
          {searchQuery && (
            <button className={styles.clearButton} onClick={() => { setSearchQuery(''); setSuggestions([]); }}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Dropdown Suggestions hasil geocoding */}
        {suggestions.length > 0 && (
          <div className={styles.suggestionsDropdown}>
            {suggestions.map((city, index) => (
              <button
                key={city.id || index}
                className={`${styles.suggestionItem} ${index === activeSuggestionIndex ? styles.suggestionItemActive : ''}`}
                onClick={() => handleSelectCity(city)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span className={styles.suggestionName}>{city.name}</span>
                  <span className={styles.suggestionBadge} style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '0.25rem',
                    background: city.type === 'local' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                    color: city.type === 'local' ? '#eab308' : '#38bdf8',
                    border: city.type === 'local' ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                  }}>
                    {city.type === 'local' ? 'Desa/Kel (BMKG)' : 'Global'}
                  </span>
                </div>
                <span className={styles.suggestionCountry}>
                  {city.country}
                  {city.type === 'global' && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      ({city.latitude.toFixed(2)}°, {city.longitude.toFixed(2)}°)
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {loadingSuggestions && (
          <div className={styles.suggestionsDropdown}>
            <div className={styles.loadingSuggestions}>
              <div className={styles.loadingSpinner}></div>
              <span>Mencari lokasi...</span>
            </div>
          </div>
        )}
      </section>

      {/* Selector Wilayah Manual Indonesia */}
      <section className={styles.manualSelectorSection}>
        <div className={styles.manualSelectorHeader}>
          <Database size={16} style={{ color: 'var(--accent-color)', marginRight: '0.25rem' }} />
          <span>Cari wilayah secara manual (Khusus Indonesia):</span>
        </div>
        <div className={styles.dropdownsGrid}>
          <div className={styles.dropdownCol}>
            <select 
              value={selectedProvince} 
              onChange={handleProvinceChange}
              className={styles.selectInput}
              disabled={loadingProvinces}
            >
              <option value="">-- Pilih Provinsi --</option>
              {provinces.map(p => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            {loadingProvinces && <div className={styles.dropdownSpinner}></div>}
          </div>

          <div className={styles.dropdownCol}>
            <select 
              value={selectedRegency} 
              onChange={handleRegencyChange}
              className={styles.selectInput}
              disabled={!selectedProvince || loadingRegencies}
            >
              <option value="">-- Pilih Kota/Kab --</option>
              {regencies.map(r => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
            {loadingRegencies && <div className={styles.dropdownSpinner}></div>}
          </div>

          <div className={styles.dropdownCol}>
            <select 
              value={selectedDistrict} 
              onChange={handleDistrictChange}
              className={styles.selectInput}
              disabled={!selectedRegency || loadingDistricts}
            >
              <option value="">-- Pilih Kecamatan --</option>
              {districts.map(d => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </select>
            {loadingDistricts && <div className={styles.dropdownSpinner}></div>}
          </div>

          <div className={styles.dropdownCol}>
            <select 
              value={selectedVillage} 
              onChange={handleVillageChange}
              className={styles.selectInput}
              disabled={!selectedDistrict || loadingVillages}
            >
              <option value="">-- Pilih Kelurahan/Desa --</option>
              {villages.map(v => (
                <option key={v.code} value={v.code}>{v.name}</option>
              ))}
            </select>
            {loadingVillages && <div className={styles.dropdownSpinner}></div>}
          </div>
        </div>
      </section>

      {/* SKELETON LOADING STATE */}
      {loadingWeather && (
        <div className={styles.loadingGrid}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className={`${styles.glassCard} ${styles.skeletonCard} ${styles.skeletonPulse}`}></div>
            <div className={`${styles.glassCard} ${styles.skeletonPulse}`} style={{ height: '220px' }}></div>
          </div>
          <div className={styles.skeletonRight}>
            <div className={`${styles.glassCard} ${styles.skeletonChart} ${styles.skeletonPulse}`}></div>
            <div className={styles.skeletonSources}>
              <div className={`${styles.glassCard} ${styles.skeletonPulse}`} style={{ height: '100%' }}></div>
              <div className={`${styles.glassCard} ${styles.skeletonPulse}`} style={{ height: '100%' }}></div>
              <div className={`${styles.glassCard} ${styles.skeletonPulse}`} style={{ height: '100%' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {!loadingWeather && weatherError && (
        <div className={styles.glassCard} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <AlertTriangle size={48} color="#f87171" />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Gagal Memuat Data</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px' }}>{weatherError}</p>
          <button 
            onClick={() => setSelectedCity({...selectedCity})}
            style={{ background: 'var(--accent-color)', color: '#0a0e17', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '9999px', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' }}
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* MAIN CONTENT DASHBOARD */}
      {!loadingWeather && !weatherError && weatherData && (
        <main className={`${styles.dashboard} animate-fade-in`}>
          
          {/* 1. Kartu Utama Konsensus Ensemble */}
          <div className={`${styles.glassCard} ${styles.ensembleCard}`}>
            <div className={styles.cardHeader}>
              <div className={styles.locationTitle}>
                <MapPin size={20} style={{ color: 'var(--accent-color)' }} />
                <div>
                  <div>{weatherData.city}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.1rem' }}>
                    {selectedCity.country} {weatherData.timezone_abbreviation && `(${weatherData.timezone_abbreviation})`}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className={`${styles.confidenceBadge} ${getConfidenceClass(weatherData.ensemble.confidence.level)}`}>
                  <Gauge size={14} />
                  <span>Keyakinan: {weatherData.ensemble.confidence.level} ({weatherData.ensemble.confidence.score}%)</span>
                </div>
                <button
                  onClick={generateInstagramStory}
                  title="Eksport sebagai Gambar Instagram Story"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #e1306c 0%, #c13584 50%, #833ab4 100%)',
                    color: '#fff',
                    border: 'none',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(225, 48, 108, 0.25)',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                </button>
              </div>
            </div>

            <div className={styles.weatherMain}>
              <div className={styles.weatherIconWrapper}>
                <WeatherIcon iconName={weatherData.ensemble.weather.icon} size={64} />
              </div>
              <div>
                <div className={styles.tempValue}>
                  {weatherData.ensemble.temp}
                  <span className={styles.tempDegree}>°C</span>
                </div>
                <div className={styles.weatherLabel}>
                  {weatherData.ensemble.weather.label}
                  {weatherData.ensemble.weather.percentage !== undefined && (
                    <span className={styles.percentageLabel}> ({weatherData.ensemble.weather.percentage}%)</span>
                  )}
                </div>
                <div className={styles.feelsLike}>
                  Terasa seperti {weatherData.ensemble.feelsLike}°C
                </div>
              </div>
            </div>

            {/* Deviasi Standar */}
            {weatherData.ensemble.confidence.stdDev !== undefined && (
              <div className={styles.stdDevIndicator}>
                <AlertTriangle size={15} style={{ color: weatherData.ensemble.confidence.stdDev > 2 ? '#fbbf24' : '#34d399' }} />
                <span>
                  Deviasi suhu antar API: <strong className={styles.stdDevValue}>{weatherData.ensemble.confidence.stdDev}°C</strong>
                  {weatherData.ensemble.confidence.stdDev < 1.0 
                    ? ' (Konsensus sangat sejalan)' 
                    : weatherData.ensemble.confidence.stdDev > 2.5 
                    ? ' (Tingkat ketidakpastian tinggi)' 
                    : ' (Konsensus wajar)'}
                </span>
              </div>
            )}

            {/* Informasi Zona Waktu */}
            {weatherData.timezone && (
              <div className={styles.timezoneIndicator} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <span style={{ color: 'var(--accent-color)', fontWeight: 650 }}>Zona Waktu:</span>
                <span>{weatherData.timezone_name} ({weatherData.timezone_abbreviation})</span>
              </div>
            )}

            {/* Grid Detail Nilai Cuaca */}
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <div className={styles.detailIcon}>
                  <Percent size={18} />
                </div>
                <div className={styles.detailValueGroup}>
                  <span className={styles.detailValue}>{weatherData.ensemble.humidity}%</span>
                  <span className={styles.detailLabel}>Kelembapan</span>
                </div>
              </div>

              <div className={styles.detailItem}>
                <div className={styles.detailIcon}>
                  <Wind size={18} />
                </div>
                <div className={styles.detailValueGroup}>
                  <span className={styles.detailValue}>{weatherData.ensemble.windSpeed} m/s</span>
                  <span className={styles.detailLabel}>Kecepatan Angin</span>
                </div>
              </div>

              <div className={styles.detailItem}>
                <div className={styles.detailIcon}>
                  <Thermometer size={18} />
                </div>
                <div className={styles.detailValueGroup}>
                  <span className={styles.detailValue}>{weatherData.ensemble.feelsLike}°C</span>
                  <span className={styles.detailLabel}>Sensasi Termal</span>
                </div>
              </div>

              <div className={styles.detailItem}>
                <div className={styles.detailIcon}>
                  <Droplets size={18} />
                </div>
                <div className={styles.detailValueGroup}>
                  <span className={styles.detailValue}>{weatherData.ensemble.precipitation} mm</span>
                  <span className={styles.detailLabel}>Curah Hujan</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Widget Prediksi 3-Jam selama 24 Jam */}
          <div className={`${styles.glassCard} ${styles.forecastSection}`}>
            <h3 className={styles.sectionTitle} style={{ marginBottom: '0.5rem' }}>
              <WeatherIcon iconName="CloudSun" size={18} style={{ color: 'var(--accent-color)', marginRight: '0.25rem' }} />
              Prediksi 24 Jam ke Depan (Per 3 Jam)
            </h3>
            <div className={styles.forecastList}>
              {weatherData.forecast && weatherData.forecast.map((fc, idx) => (
                <div key={idx} className={styles.forecastCard}>
                  <span className={styles.forecastTime}>{fc.displayTime}</span>
                  <span className={styles.forecastDate}>{fc.displayDate}</span>
                  <div className={styles.forecastIconWrapper}>
                    <WeatherIcon iconName={fc.weather.icon} size={28} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', justifyContent: 'center' }}>
                    <span className={styles.forecastTemp}>{fc.temp}°C</span>
                    {fc.temp_stddev !== undefined && (
                      <span style={{ fontSize: '0.65rem', color: fc.temp_stddev > 2 ? '#fbbf24' : '#34d399', fontWeight: 700 }} title="Simpangan baku suhu antar model">
                        &plusmn;{fc.temp_stddev.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <span className={styles.forecastWeatherLabel}>{fc.weather.label}</span>
                  {fc.weather.percentage !== undefined && (
                    <span className={styles.forecastPercentage}>{fc.weather.percentage}%</span>
                  )}
                  
                  <div className={styles.forecastMeta}>
                    <div className={styles.forecastMetaItem}>
                      <Droplets size={10} />
                      <span>{fc.humidity}%</span>
                    </div>
                    <div className={styles.forecastMetaItem}>
                      <Wind size={10} />
                      <span>{fc.windSpeed} m/s</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Grafik Perbandingan */}
          <EnsembleChart data={weatherData} />

          {/* 4. Analisis Statistik & Spread Ensemble (Tabel Baru) */}
          <div className={styles.glassCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                <Database size={18} style={{ color: 'var(--accent-color)', marginRight: '0.25rem' }} />
                Matriks Analisis Statistik & Spread Ensemble
              </h3>

              {/* Tab Selector */}
              <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.04)', padding: '0.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <button
                  className={`${styles.tableTabBtn} ${activeTableTab === 'continuous' ? styles.tableTabBtnActive : ''}`}
                  onClick={() => setActiveTableTab('continuous')}
                  style={{
                    background: activeTableTab === 'continuous' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    border: 'none',
                    color: activeTableTab === 'continuous' ? '#38bdf8' : 'var(--text-secondary)',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                >
                  Rata-Rata & Standar Deviasi (Suhu/RH)
                </button>
                <button
                  className={`${styles.tableTabBtn} ${activeTableTab === 'discrete' ? styles.tableTabBtnActive : ''}`}
                  onClick={() => setActiveTableTab('discrete')}
                  style={{
                    background: activeTableTab === 'discrete' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    border: 'none',
                    color: activeTableTab === 'discrete' ? '#38bdf8' : 'var(--text-secondary)',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                >
                  Spread Probabilitas & Konsensus Cuaca
                </button>
              </div>
            </div>

            {activeTableTab === 'continuous' ? (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
                  <strong>Tabel 1 (Mean_StdDev_RH_Temp):</strong> Menampilkan nilai rata-rata (&mu;) dan simpangan baku (&sigma;) sampel untuk variabel suhu (temp) dan kelembapan (humi) untuk setiap grup dimensi waktu (time_wib) hasil kalkulasi ensemble (Modul 2 &amp; 4).
                </p>
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Waktu ({weatherData.timezone_abbreviation || 'WIB'})</th>
                        <th>Temp_Mean (&mu; Suhu)</th>
                        <th>Temp_StdDev (&sigma; Suhu)</th>
                        <th>Humi_Mean (&mu; Kelembapan)</th>
                        <th>Humi_StdDev (&sigma; Kelembapan)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weatherData.Mean_StdDev_RH_Temp && weatherData.Mean_StdDev_RH_Temp.map((row, idx) => (
                        <tr key={idx}>
                          <td className={styles.tableTime}>{row.time_wib}</td>
                          <td>{row.Temp_Mean.toFixed(2)} °C</td>
                          <td style={{ color: row.Temp_StdDev > 2 ? '#fbbf24' : '#34d399', fontWeight: 500 }}>
                            &plusmn; {row.Temp_StdDev.toFixed(2)} °C
                          </td>
                          <td>{row.Humi_Mean.toFixed(2)} %</td>
                          <td style={{ color: row.Humi_StdDev > 10 ? '#fbbf24' : '#34d399', fontWeight: 500 }}>
                            &plusmn; {row.Humi_StdDev.toFixed(2)} %
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
                  <strong>Tabel 2 (Spread_Klasifikasi_Cuaca):</strong> Menampilkan persentase spread probabilitas kemunculan kelas cuaca (Modul 3) sekuensial (Modul 1) di seluruh model ensemble serta hasil prediksi mode (Prediksi_Paling_Mungkin).
                </p>
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Waktu ({weatherData.timezone_abbreviation || 'WIB'})</th>
                        <th>Cerah</th>
                        <th>Cerah Berawan</th>
                        <th>Berawan</th>
                        <th>Hujan Ringan</th>
                        <th>Hujan Sedang</th>
                        <th>Hujan Lebat</th>
                        <th>Prediksi_Paling_Mungkin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weatherData.Spread_Klasifikasi_Cuaca && weatherData.Spread_Klasifikasi_Cuaca.map((row, idx) => (
                        <tr key={idx}>
                          <td className={styles.tableTime}>{row.time_wib}</td>
                          <td>{row.Cerah.toFixed(2)}%</td>
                          <td>{row['Cerah Berawan'].toFixed(2)}%</td>
                          <td>{row.Berawan.toFixed(2)}%</td>
                          <td>{row['Hujan Ringan'].toFixed(2)}%</td>
                          <td>{row['Hujan Sedang'].toFixed(2)}%</td>
                          <td>{row['Hujan Lebat'].toFixed(2)}%</td>
                          <td>
                            <span 
                              className={styles.tableBadge}
                              style={{ 
                                background: row.Prediksi_Paling_Mungkin.includes('Hujan') 
                                  ? 'rgba(59, 130, 246, 0.15)' 
                                  : 'rgba(245, 158, 11, 0.15)',
                                color: row.Prediksi_Paling_Mungkin.includes('Hujan') ? '#3b82f6' : '#fbbf24',
                                border: row.Prediksi_Paling_Mungkin.includes('Hujan') 
                                  ? '1px solid rgba(59, 130, 246, 0.3)' 
                                  : '1px solid rgba(245, 158, 11, 0.3)'
                              }}
                            >
                              <WeatherIcon iconName={CUACA_INFO_MAP[row.Prediksi_Paling_Mungkin]?.icon} size={13} style={{ marginRight: '0.15rem' }} />
                              {row.Prediksi_Paling_Mungkin}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 5. Validasi & Akurasi Model vs Data Riil */}
          {weatherData.validation && (
            <div className={styles.glassCard}>
              <h3 className={styles.sectionTitle} style={{ marginBottom: '0.5rem' }}>
                <Gauge size={18} style={{ color: 'var(--accent-color)', marginRight: '0.25rem' }} />
                Validasi Prediksi vs Data Riil ({weatherData.validation.reference})
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
                Memvalidasi deviasi pembacaan masing-masing model cuaca global secara real-time terhadap data riil referensi stasiun <strong>{weatherData.validation.reference}</strong> ({weatherData.validation.temp_ref}°C, {weatherData.validation.humi_ref}% RH).
              </p>
              
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Penyedia Model</th>
                      <th>Suhu Model</th>
                      <th>Selisih Suhu (&Delta; Temp)</th>
                      <th>Kelembapan Model</th>
                      <th>Selisih Kelembapan (&Delta; Humi)</th>
                      <th>Akurasi Relatif Suhu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weatherData.validation.items.map((item, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.model}</td>
                        <td>{item.temp}°C</td>
                        <td style={{ 
                          color: item.temp_diff === 0 ? '#34d399' : item.temp_diff > 0 ? '#f87171' : '#60a5fa',
                          fontWeight: 600 
                        }}>
                          {item.temp_diff > 0 ? `+${item.temp_diff}` : item.temp_diff} °C
                        </td>
                        <td>{item.humidity}%</td>
                        <td style={{ 
                          color: item.humi_diff === 0 ? '#34d399' : item.humi_diff > 0 ? '#f87171' : '#60a5fa',
                          fontWeight: 600
                        }}>
                          {item.humi_diff > 0 ? `+${item.humi_diff}` : item.humi_diff} %
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ 
                              height: '6px', 
                              width: '60px', 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              borderRadius: '3px',
                              overflow: 'hidden' 
                            }}>
                              <div style={{ 
                                height: '100%', 
                                width: `${item.accuracy}%`, 
                                background: item.accuracy > 90 ? '#34d399' : item.accuracy > 75 ? '#fbbf24' : '#f87171'
                              }}></div>
                            </div>
                            <span style={{ 
                              fontWeight: 750, 
                              color: item.accuracy > 90 ? '#34d399' : item.accuracy > 75 ? '#fbbf24' : '#f87171',
                              fontSize: '0.8rem'
                            }}>
                              {item.accuracy}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. Data Berdasarkan Sumber API */}
          <div className={styles.glassCard}>
            <h3 className={styles.sectionTitle} style={{ marginBottom: '1.25rem' }}>
              <MapPin size={18} style={{ color: 'var(--accent-color)', marginRight: '0.25rem' }} />
              Data Berdasarkan Sumber API
            </h3>
            <div className={styles.sourcesGrid}>
              {Object.values(weatherData.sources).map((src) => (
                <div key={src.name} className={styles.sourceCard}>
                  <div className={styles.sourceHeader}>
                    <span className={styles.sourceName}>{src.name}</span>
                    {src.simulated ? (
                      <span className={`${styles.statusBadge} ${styles.statusSimulated}`}>Simulasi</span>
                    ) : (
                      <span className={`${styles.statusBadge} ${styles.statusLive}`}>Live</span>
                    )}
                  </div>
                  
                  <div className={styles.sourceBody}>
                    {src.error ? (
                      <div style={{ color: '#f87171', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span>Gagal terhubung:</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{src.error}</span>
                      </div>
                    ) : (
                      <>
                        <div className={styles.sourceTempRow}>
                          {src.weather?.icon && (
                            <WeatherIcon iconName={src.weather.icon} size={28} style={{ color: 'var(--accent-color)' }} />
                          )}
                          <div>
                            <div className={styles.sourceTemp}>{src.temp}°C</div>
                            <div className={styles.sourceWeatherLabel}>{src.weather?.label || 'Mendung'}</div>
                          </div>
                        </div>

                        <div className={styles.sourceDetails}>
                          <div className={styles.sourceDetailItem}>
                            <span>Kelembapan:</span>
                            <span className={styles.sourceDetailVal}>{src.humidity}%</span>
                          </div>
                          <div className={styles.sourceDetailItem}>
                            <span>Angin:</span>
                            <span className={styles.sourceDetailVal}>
                              {src.windSpeed !== null ? (Math.round(src.windSpeed * 10) / 10) : '-'} m/s
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Banner Peringatan jika menggunakan data Simulasi */}
          {hasSimulatedData && (
            <div className={styles.envAlert}>
              <div className={styles.envAlertHeader}>
                <HelpCircle size={18} />
                <span>Informasi Mode Uji / Kunci API Hilang</span>
              </div>
              <div className={styles.envAlertBody}>
                <p>
                  Aplikasi ini berjalan dalam mode <strong>simulasi</strong> untuk beberapa API. Kunci API untuk <strong>WeatherAPI</strong> atau <strong>OpenWeatherMap</strong> belum terdeteksi di server kami.
                </p>
                <p style={{ marginTop: '0.5rem' }}>
                  Untuk mengaktifkan data langsung dan real-time sepenuhnya, silakan buat file <strong>.env.local</strong> di direktori utama proyek Anda dan tambahkan kunci berikut:
                </p>
                <pre style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', overflowX: 'auto', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
{`WEATHER_API_KEY=kunci_weatherapi_anda
OPENWEATHERMAP_API_KEY=kunci_openweathermap_anda`}
                </pre>
              </div>
            </div>
          )}

        </main>
      )}

      {/* Footer */}
      <footer className={styles.footer}>
        <div>
          Ensemble Weather Predictor © 2026. Data didukung secara real-time oleh <a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a>.
        </div>
        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
          Metode konsensus menghitung rata-rata deviasi temperatur secara matematis untuk memberikan skor tingkat keyakinan prakiraan.
        </div>
      </footer>

      {/* Modal Instagram Story Export */}
      {showStoryModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(5, 7, 12, 0.9)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div 
            style={{
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '1.5rem',
              padding: '1.5rem',
              maxWidth: '450px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              position: 'relative'
            }}
          >
            {/* Close Button */}
            <button 
              onClick={() => setShowStoryModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#fff',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <X size={16} />
            </button>

            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', margin: 0 }}>Instagram Story Preview</h3>
            
            {/* Preview Image (9:16 aspect ratio scaled) */}
            <div 
              style={{ 
                width: '200px', 
                height: '356px', 
                borderRadius: '0.75rem', 
                overflow: 'hidden', 
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)'
              }}
            >
              <img 
                src={storyImageUrl} 
                alt="Instagram Story Preview" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {/* Instructions */}
            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4', padding: '0 0.5rem' }}>
              <p style={{ fontWeight: 650, color: '#fbbf24', marginBottom: '0.25rem' }}>💡 Petunjuk Penyimpanan:</p>
              <p><strong>Mobile (HP):</strong> Tekan lama pada gambar lalu pilih <strong>Simpan Gambar / Save Image</strong>.</p>
              <p style={{ marginTop: '0.15rem' }}><strong>Desktop:</strong> Klik tombol unduh di bawah ini.</p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
              <button
                onClick={() => setShowStoryModal(false)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'background 0.2s'
                }}
              >
                Tutup
              </button>
              
              <a
                href={storyImageUrl}
                download={`${weatherData.city.toLowerCase()}_weather_story.png`}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #e1306c 0%, #c13584 50%, #833ab4 100%)',
                  color: '#fff',
                  textDecoration: 'none',
                  textAlign: 'center',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  boxShadow: '0 4px 10px rgba(225, 48, 108, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                Unduh Gambar
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
