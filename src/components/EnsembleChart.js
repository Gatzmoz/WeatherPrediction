'use client';

import React, { useState } from 'react';
import styles from '../app/page.module.css';

export default function EnsembleChart({ data }) {
  const [activeMetric, setActiveMetric] = useState('temp'); // 'temp' | 'humidity' | 'wind'

  if (!data) return null;

  const sources = [
    { key: 'openMeteo', name: 'Open-Meteo', color: '#38bdf8' },
    { key: 'weatherApi', name: 'WeatherAPI', color: '#fbbf24' },
    { key: 'openWeatherMap', name: 'OpenWeatherMap', color: '#c084fc' },
    { key: 'gfs', name: 'GFS (NOAA)', color: '#ec4899' },
    { key: 'ecmwf', name: 'ECMWF (Europe)', color: '#f97316' },
    { key: 'icon', name: 'ICON (DWD)', color: '#06b6d4' }
  ];

  if (data.sources && data.sources.bmkg && data.sources.bmkg.active) {
    sources.push({ key: 'bmkg', name: 'BMKG (Indonesia)', color: '#eab308' });
  }

  if (data.sources && data.sources.machineLearning && data.sources.machineLearning.active) {
    sources.push({ key: 'machineLearning', name: 'ML-MOS (Bias)', color: '#a855f7' });
  }

  // Ekstrak data untuk grafik
  const chartData = sources.map(src => {
    const srcData = data.sources[src.key];
    return {
      name: src.name,
      color: src.color,
      simulated: srcData?.simulated || false,
      temp: srcData?.temp !== null ? srcData.temp : 0,
      humidity: srcData?.humidity !== null ? srcData.humidity : 0,
      windSpeed: srcData?.windSpeed !== null ? srcData.windSpeed : 0
    };
  });

  // Tambahkan data Ensemble
  const ensembleItem = {
    name: 'Ensemble (Konsensus)',
    color: '#34d399',
    simulated: false,
    temp: data.ensemble.temp,
    humidity: data.ensemble.humidity,
    windSpeed: data.ensemble.windSpeed
  };

  const allItems = [...chartData, ensembleItem];

  // Detail metrik aktif
  const metricDetails = {
    temp: {
      label: 'Temperatur',
      unit: '°C',
      color: '#38bdf8',
      accessor: item => item.temp,
      ensembleVal: data.ensemble.temp
    },
    humidity: {
      label: 'Kelembapan',
      unit: '%',
      color: '#a78bfa',
      accessor: item => item.humidity,
      ensembleVal: data.ensemble.humidity
    },
    wind: {
      label: 'Kecepatan Angin',
      unit: ' m/s',
      color: '#f472b6',
      accessor: item => item.windSpeed,
      ensembleVal: data.ensemble.windSpeed
    }
  };

  const currentMetric = metricDetails[activeMetric];
  const values = allItems.map(currentMetric.accessor);
  
  // Kalkulasi skala SVG
  const svgWidth = 600;
  const svgHeight = 200;
  const paddingLeft = 60;
  const paddingRight = 40;
  const paddingTop = 30;
  const paddingBottom = 40;

  const maxVal = Math.max(...values, 10) * 1.15; // Beri ruang di atas bar
  const minVal = Math.min(...values, 0) < 0 ? Math.min(...values) * 1.15 : 0; // Dukung suhu negatif jika ada
  
  const getX = index => {
    const availableWidth = svgWidth - paddingLeft - paddingRight;
    const spacing = availableWidth / allItems.length;
    return paddingLeft + index * spacing + spacing / 2;
  };

  const getY = val => {
    const availableHeight = svgHeight - paddingTop - paddingBottom;
    const ratio = (val - minVal) / (maxVal - minVal);
    return svgHeight - paddingBottom - ratio * availableHeight;
  };

  const getBarHeight = val => {
    const yVal = getY(val);
    const yZero = getY(Math.max(0, minVal));
    return Math.abs(yZero - yVal);
  };

  const getBarY = val => {
    const yVal = getY(val);
    const yZero = getY(Math.max(0, minVal));
    return val >= 0 ? yVal : yZero;
  };

  return (
    <div className={`${styles.glassCard} ${styles.chartCard}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.25rem' }}>
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Perbandingan Detail API
        </h3>

        {/* Tab Metrik */}
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', padding: '0.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          {Object.keys(metricDetails).map(key => (
            <button
              key={key}
              onClick={() => setActiveMetric(key)}
              style={{
                background: activeMetric === key ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                border: 'none',
                color: activeMetric === key ? '#38bdf8' : 'var(--text-secondary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem',
                fontSize: '0.8rem',
                fontWeight: 650,
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none'
              }}
            >
              {metricDetails[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div className={styles.chartContainer}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
          {/* Garis Grid Horizontal */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const val = minVal + ratio * (maxVal - minVal);
            const y = getY(val);
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  fill="var(--text-muted)"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  {Math.round(val * 10) / 10}{currentMetric.unit}
                </text>
              </g>
            );
          })}

          {/* Garis Horizontal Ensemble Consensus (Sebagai Baseline Guideline) */}
          <line
            x1={paddingLeft}
            y1={getY(currentMetric.ensembleVal)}
            x2={svgWidth - paddingRight}
            y2={getY(currentMetric.ensembleVal)}
            stroke="rgba(52, 211, 153, 0.4)"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />

          {/* Bar Chart Data */}
          {allItems.map((item, index) => {
            const val = currentMetric.accessor(item);
            const x = getX(index);
            const y = getBarY(val);
            const barHeight = Math.max(getBarHeight(val), 2); // Tinggi minimal 2px agar kelihatan
            const barWidth = 22;

            return (
              <g key={item.name} style={{ transition: 'all 0.5s ease' }}>
                {/* Bar Element dengan efek gradien dan rounded top */}
                <rect
                  x={x - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={item.color}
                  opacity={item.simulated ? 0.65 : 0.9}
                  rx="6"
                  style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                />
                
                {/* Tag Nilai di atas Bar */}
                <text
                  x={x}
                  y={y - 8}
                  fill={item.color}
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                >
                  {val}{currentMetric.unit}
                </text>

                {/* Label Sumber di X Axis */}
                <text
                  x={x}
                  y={svgHeight - 15}
                  fill={index === allItems.length - 1 ? '#34d399' : 'var(--text-secondary)'}
                  fontSize="8"
                  fontWeight={index === allItems.length - 1 ? '700' : '500'}
                  textAnchor="middle"
                >
                  {item.name.replace(' (Konsensus)', '')}
                </text>
                
                {item.simulated && (
                  <text
                    x={x}
                    y={svgHeight - 4}
                    fill="#fbbf24"
                    fontSize="8"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    (Simulated)
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend Chart */}
      <div className={styles.chartLegend}>
        {allItems.map(item => (
          <div key={item.name} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ backgroundColor: item.color, opacity: item.simulated ? 0.65 : 1 }}></span>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
