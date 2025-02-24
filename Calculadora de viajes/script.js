document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const startInput = document.getElementById('start');
    const destinationInput = document.getElementById('destination');
    const transportOptions = document.querySelectorAll('.transport-option');
    const calculateBtn = document.getElementById('calculate');
    const roundTripCheckbox = document.getElementById('roundTrip');
    const currencySelect = document.getElementById('currency');
    const themeToggle = document.getElementById('theme-toggle');
    const resultsDiv = document.getElementById('results');
    const tollCheckbox = document.getElementById('tollIncluded'); // New checkbox for toll inclusion
  
    // Inicializar mapa
    const map = L.map('map').setView([18.4861, -69.9312], 13);
    let markers = [];
    let routeLine;
  
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  
    // Datos de rutas (simulados)
    const routes = {
      rates: {
        car: { base: 60, perKm: 15, toll: 100 },
        bus: { base: 20, perKm: 8, toll: 200 },
        bike: { base: 100, perKm: 5, toll: 50 }
      },
      emissions: {
        car: 0.12,    // kg CO2 por km
        bus: 0.05,    // kg CO2 por km
        bike: 0.03   // kg CO2 por km
      }
    };
  
    // Función para geocodificar direcciones o nombres de ubicaciones usando Nominatim
    function geocodeAddress(address) {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
      return fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'es',
          'Accept-Language': 'en',  // Opcional: mejora la relevancia para búsquedas en español
          // En producción, considere agregar un encabezado "User-Agent" apropiado según la política de Nominatim.
        }
      })
        .then(response => response.json())
        .then(data => {
          if (data && data.length > 0) {
            return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
          } else {
            throw new Error('No se encontraron resultados para ' + address);
          }
        });
    }
  
    // Función para actualizar el mapa usando OSRM para obtener la ruta siguiendo las calles
    function updateMap(start, end, startCoords, endCoords) {
      // Limpiar marcadores y rutas anteriores
      markers.forEach(marker => map.removeLayer(marker));
      markers = [];
      if (routeLine) map.removeLayer(routeLine);
  
      // Agregar marcadores
      markers.push(L.marker(startCoords).addTo(map).bindPopup(start));
      markers.push(L.marker(endCoords).addTo(map).bindPopup(end));
  
      // Construir la URL para OSRM. Recuerde que OSRM espera el formato: lon,lat.
      const url = `https://router.project-osrm.org/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson`;
  
      fetch(url)
        .then(response => response.json())
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            routeLine = L.geoJSON(route.geometry, {
              style: {
                color: 'blue',
                weight: 5,
                opacity: 0.7
              }
            }).addTo(map);
            map.fitBounds(routeLine.getBounds());
          } else {
            throw new Error('No se encontró ruta');
          }
        })
        .catch(error => {
          console.error('Error en la ruta:', error);
          // Fallback: trazar una línea directa si falla la ruta
          routeLine = L.polyline([startCoords, endCoords], { color: 'blue' }).addTo(map);
          map.fitBounds(routeLine.getBounds());
        });
    }
  
    // Funciones de utilidad
    function updateTheme() {
      if (document.body.classList.contains('dark-theme')) {
        document.body.classList.remove('dark-theme');
        themeToggle.textContent = '🌙';
      } else {
        document.body.classList.add('dark-theme');
        themeToggle.textContent = '☀️';
      }
    }
  
    function calculateTime(distance, transportType) {
      const speeds = { car: 75, bus: 65, bike: 70 }; // km/h
      return Math.round((distance / speeds[transportType]) * 60);
    }
  
    function formatCurrency(amount, currency) {
      const ratesConv = { DOP: 1, USD: 0.018 };
      const symbols = { DOP: 'RD$', USD: '$' };
      const converted = amount * ratesConv[currency];
      return `${symbols[currency]} ${converted.toFixed(2)}`;
    }
  
    // Función principal que usa la geocodificación y routing para calcular la distancia real y determinar el costo
    function calculatePrice() {
      const start = startInput.value;
      const destination = destinationInput.value;
      const transportType = document.querySelector('.transport-option.active').dataset.type;
      const isRoundTrip = roundTripCheckbox.checked;
      const currency = currencySelect.value;
      const tollIncluded = tollCheckbox.checked; // Si el usuario indica que el trayecto pasa por un peaje
  
      if (!start || !destination) {
        alert('Por favor, ingrese punto de partida y destino');
        return;
      }
  
      Promise.all([geocodeAddress(start), geocodeAddress(destination)])
        .then(([startCoords, endCoords]) => {
          // Actualizar mapa usando la ruta que sigue las calles
          updateMap(start, destination, startCoords, endCoords);
  
          // Calcular la distancia real utilizando la función de distancia de Leaflet (en metros)
          const distanceMeters = L.latLng(startCoords).distanceTo(L.latLng(endCoords));
          let distanceKm = distanceMeters / 1000;
          if (isRoundTrip) distanceKm *= 2;
  
          // Calcular tiempo y costos
          const time = calculateTime(distanceKm, transportType);
          const ratesObj = routes.rates[transportType];
          const baseFare = ratesObj.base;
          const distanceCost = distanceKm * ratesObj.perKm;
          const tollCost = tollIncluded ? ratesObj.toll : 0;
          const tax = (baseFare + distanceCost) * 0.18; // 18% ITBIS
          const totalCost = baseFare + distanceCost + tollCost + tax;
          const emissions = distanceKm * routes.emissions[transportType];
  
          // Actualizar resultados en la UI
          document.getElementById('total-cost').textContent = formatCurrency(totalCost, currency);
          document.getElementById('distance').textContent = `${distanceKm.toFixed(1)} km`;
          document.getElementById('time').textContent = `${time} min`;
          document.getElementById('base-fare').textContent = formatCurrency(baseFare + distanceCost, currency);
          document.getElementById('toll-cost').textContent = formatCurrency(tollCost, currency);
          document.getElementById('tax-cost').textContent = formatCurrency(tax, currency);
          document.getElementById('emissions').textContent = `${emissions.toFixed(1)} kg`;
  
          resultsDiv.classList.remove('hidden');
        })
        .catch(error => {
          console.error('Error en la geocodificación:', error);
          alert('Error al obtener las coordenadas. Por favor, verifique las direcciones ingresadas.');
        });
    }
  
    // Event Listeners
    transportOptions.forEach(option => {
      option.addEventListener('click', function() {
        transportOptions.forEach(opt => opt.classList.remove('active'));
        this.classList.add('active');
      });
    });
  
    calculateBtn.addEventListener('click', calculatePrice);
    themeToggle.addEventListener('click', updateTheme);
    
    
  
    // Limpiar destino
    document.querySelector('.clear-btn').addEventListener('click', function() {
      destinationInput.value = '';
      destinationInput.focus();
    });
  
    // Actualizar precios cuando cambia la moneda
    currencySelect.addEventListener('change', function() {
      if (!resultsDiv.classList.contains('hidden')) {
        calculatePrice();
      }
    });
  });