'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudLightning, Snowflake,
  Search, X, MapPin, Thermometer, Droplets, Wind, Percent, HelpCircle, AlertTriangle, Gauge
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
    longitude: 106.8451
  });

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

  // Ambil data cuaca saat kota terpilih berubah
  useEffect(() => {
    async function fetchWeather() {
      setLoadingWeather(true);
      setWeatherError(null);
      try {
        const response = await fetch(
          `/api/weather?lat=${selectedCity.latitude}&lon=${selectedCity.longitude}&city=${encodeURIComponent(selectedCity.name)}`
        );
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

  // Handler input pencarian dengan debouncing
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
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=5&language=id&format=json`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.results || []);
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 450);
  };

  // Pilih kota dari dropdown geocoding
  const handleSelectCity = (city) => {
    setSelectedCity({
      name: city.name,
      country: city.country || city.admin1 || '',
      latitude: city.latitude,
      longitude: city.longitude
    });
    setSearchQuery('');
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
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
                <span className={styles.suggestionName}>{city.name}</span>
                <span className={styles.suggestionCountry}>
                  {city.admin1 ? `${city.admin1}, ` : ''}{city.country} 
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    ({city.latitude.toFixed(2)}°, {city.longitude.toFixed(2)}°)
                  </span>
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
          
          <div className={styles.mainGrid}>
            
            {/* 1. Kolom Kiri: Kartu Utama & Prediksi 24 Jam */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Kartu Utama Konsensus Ensemble */}
              <div className={`${styles.glassCard} ${styles.ensembleCard}`}>
                <div className={styles.cardHeader}>
                  <div className={styles.locationTitle}>
                    <MapPin size={20} style={{ color: 'var(--accent-color)' }} />
                    <div>
                      <div>{weatherData.city}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.1rem' }}>
                        {selectedCity.country}
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

              {/* Widget Prediksi 3-Jam selama 24 Jam */}
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
            </div>

            {/* 2. Grafik Perbandingan & Panel API Sumber */}
            <div className={styles.sourcesSection}>
              {/* Grafik */}
              <EnsembleChart data={weatherData} />
              
              {/* Grid perbandingan data per API */}
              <div>
                <h3 className={styles.sectionTitle}>
                  <MapPin size={18} style={{ color: 'var(--accent-color)' }} />
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
                                <span className={styles.sourceDetailVal}>{src.windSpeed} m/s</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

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
