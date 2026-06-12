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
        (position) => {
          setSelectedCity({
            name: 'Lokasi Anda (GPS)',
            country: 'Koordinat Perangkat',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            adm4: null
          });
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
      (position) => {
        setSelectedCity({
          name: 'Lokasi Anda (GPS)',
          country: 'Koordinat Perangkat',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          adm4: null
        });
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

              <div className={`${styles.confidenceBadge} ${getConfidenceClass(weatherData.ensemble.confidence.level)}`}>
                <Gauge size={14} />
                <span>Keyakinan: {weatherData.ensemble.confidence.level} ({weatherData.ensemble.confidence.score}%)</span>
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
                  <span className={styles.forecastTemp}>{fc.temp}°C</span>
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

          {/* 5. Data Berdasarkan Sumber API */}
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

    </div>
  );
}
