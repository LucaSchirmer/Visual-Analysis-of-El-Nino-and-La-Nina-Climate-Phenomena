// ==========================================
// CONSTANTS
// ==========================================
const ONI_DATA_URL = "https://psl.noaa.gov/data/correlation/oni.data";
const WORLD_BANK_API_BASE = "https://api.worldbank.org/v2";
const GDP_INDICATOR = "NY.GDP.MKTP.KD.ZG";

// Local files (preprocessed from NetCDF/restricted sources)
const LOCAL_FISHING_DATA = "./data/fishing-data.csv";
const LOCAL_RAINFALL_DATA = "./data/rainfall-data.csv";
const LOCAL_TEMPERATURE_DATA = "./data/temperature-data.csv";

// Data storage
let allData = {
    oni: null,
    gdp: null,
    fishing: null,
    rainfall: null,
    temperature: null
};

// ==========================================
// 1. ONI DATA (El Niño/La Niña)
// ==========================================
const loadONIData = async () => {
    try {
        updateStatus('oni', 'loading', 'Loading ONI data...');
        
        // Fetch the raw text data
        const response = await fetch(ONI_DATA_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const text = await response.text();
        
        // Parse the ONI data format
        // Format: Year followed by 12 monthly values
        const lines = text.trim().split('\n').filter(line => line.trim() && !line.startsWith('#'));
        const data = [];
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        lines.forEach(line => {
            const values = line.trim().split(/\s+/);
            const year = parseInt(values[0]);
            
            // Skip header rows or invalid data
            if (isNaN(year) || year < 1900) return;
            
            // Each line has: Year + 12 monthly values
            for (let i = 1; i <= 12 && i < values.length; i++) {
                const value = parseFloat(values[i]);
                if (!isNaN(value) && value !== -99.99) { // -99.99 is missing data
                    data.push({
                        year: year,
                        month: months[i - 1],
                        monthNum: i,
                        date: new Date(year, i - 1, 1),
                        oni: value,
                        phase: value >= 0.5 ? 'El Niño' : value <= -0.5 ? 'La Niña' : 'Neutral',
                        intensity: Math.abs(value) >= 2.0 ? 'Very Strong' :
                                  Math.abs(value) >= 1.5 ? 'Strong' :
                                  Math.abs(value) >= 1.0 ? 'Moderate' :
                                  Math.abs(value) >= 0.5 ? 'Weak' : 'Neutral'
                    });
                }
            }
        });
        
        allData.oni = data;
        updateStatus('oni', 'success', `Loaded ${data.length} ONI records`);
        return data;
        
    } catch (error) {
        updateStatus('oni', 'error', `ONI Error: ${error.message}`);
        console.error('ONI loading error:', error);
        return null;
    }
};

// ==========================================
// 2. WORLD BANK GDP DATA
// ==========================================
const loadGDPData = async (countries = ['PER', 'ECU', 'CHL']) => {
    try {
        updateStatus('gdp', 'loading', 'Loading World Bank GDP data...');
        
        // Build the API URL for multiple countries
        const countryString = countries.join(';');
        const url = `${WORLD_BANK_API_BASE}/country/${countryString}/indicator/${GDP_INDICATOR}?format=json&per_page=1000&date=1990:2024`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const jsonData = await response.json();
        
        // World Bank returns [metadata, data]
        if (!jsonData || jsonData.length < 2) {
            throw new Error('Invalid World Bank API response');
        }
        
        const rawData = jsonData[1];
        
        // Transform the data
        const data = rawData
            .filter(item => item.value !== null)
            .map(item => ({
                country: item.country.value,
                countryCode: item.countryid,
                year: parseInt(item.date),
                gdpGrowth: parseFloat(item.value),
                indicator: item.indicator.value
            }))
            .sort((a, b) => a.year - b.year);
        
        allData.gdp = data;
        updateStatus('gdp', 'success', `Loaded ${data.length} GDP records for ${countries.length} countries`);
        return data;
        
    } catch (error) {
        updateStatus('gdp', 'error', `GDP Error: ${error.message}`);
        console.error('GDP loading error:', error);
        return null;
    }
};

// ==========================================
// 3. FISHING DATA (Local CSV)
// ==========================================
const loadFishingData = async () => {
    try {
        updateStatus('fishing', 'loading', 'Loading fishing data...');
        
        // Load CSV using D3
        const data = await d3.csv(LOCAL_FISHING_DATA, d => ({
            year: +d.year,
            species: d.species,
            taxon: d.taxon,
            tonnage: +d.tonnage,
            country: d.country || 'Peru'
        }));
        
        allData.fishing = data;
        updateStatus('fishing', 'success', `Loaded ${data.length} fishing records`);
        return data;
        
    } catch (error) {
        updateStatus('fishing', 'error', `Fishing Error: ${error.message}. Make sure to create data/fishing-data.csv from Sea Around Us website.`);
        console.error('Fishing data error:', error);
        return null;
    }
};

// ==========================================
// 4. RAINFALL DATA (Local CSV from NetCDF)
// ==========================================
const loadRainfallData = async () => {
    try {
        updateStatus('rainfall', 'loading', 'Loading rainfall data...');
        
        const data = await d3.csv(LOCAL_RAINFALL_DATA, d => ({
            date: new Date(d.date),
            year: +d.year,
            month: +d.month,
            latitude: +d.latitude,
            longitude: +d.longitude,
            rainfall: +d.rainfall, // mm
            region: d.region
        }));
        
        allData.rainfall = data;
        updateStatus('rainfall', 'success', `Loaded ${data.length} rainfall records`);
        return data;
        
    } catch (error) {
        updateStatus('rainfall', 'error', `Rainfall Error: ${error.message}. Convert NetCDF to CSV first (see preprocessing script).`);
        console.error('Rainfall data error:', error);
        return null;
    }
};

// ==========================================
// 5. TEMPERATURE DATA (Local CSV from NetCDF)
// ==========================================
const loadTemperatureData = async () => {
    try {
        updateStatus('temperature', 'loading', 'Loading temperature data...');
        
        const data = await d3.csv(LOCAL_TEMPERATURE_DATA, d => ({
            date: new Date(d.date),
            year: +d.year,
            month: +d.month,
            latitude: +d.latitude,
            longitude: +d.longitude,
            temperature: +d.temperature, // Celsius
            region: d.region
        }));
        
        allData.temperature = data;
        updateStatus('temperature', 'success', `Loaded ${data.length} temperature records`);
        return data;
        
    } catch (error) {
        updateStatus('temperature', 'error', `Temperature Error: ${error.message}. Convert NetCDF to CSV first (see preprocessing script).`);
        console.error('Temperature data error:', error);
        return null;
    }
};

// ==========================================
// LOAD ALL DATA
// ==========================================
const loadAllData = async () => {
    console.log('Starting data load...');
    
    // Clear previous status
    document.getElementById('status-container').innerHTML = '';
    
    // Load data in parallel
    const results = await Promise.all([
        loadONIData(),
        loadGDPData(['PER', 'ECU', 'CHL', 'COL']), // Peru, Ecuador, Chile, Colombia
        loadFishingData(),
        loadRainfallData(),
        loadTemperatureData()
    ]);
    
    console.log('All data loaded:', allData);
    displayDataSummary();
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================
const updateStatus = (dataType, status, message) => {
    const container = document.getElementById('status-container');
    const existingStatus = document.getElementById(`status-${dataType}`);
    
    if (existingStatus) {
        existingStatus.className = `status ${status}`;
        existingStatus.textContent = message;
    } else {
        const statusDiv = document.createElement('div');
        statusDiv.id = `status-${dataType}`;
        statusDiv.className = `status ${status}`;
        statusDiv.textContent = message;
        container.appendChild(statusDiv);
    }
};

const displayDataSummary = () => {
    const container = document.getElementById('data-container');
    
    let html = '<h2>Data Summary</h2>';
    
    // ONI Data summary
    if (allData.oni && allData.oni.length > 0) {
        const recentONI = allData.oni.slice(-12);
        html += `
            <h3>Recent ONI Values (Last 12 months)</h3>
            <table>
                <thead>
                    <tr><th>Date</th><th>ONI Value</th><th>Phase</th><th>Intensity</th></tr>
                </thead>
                <tbody>
                    ${recentONI.map(d => `
                        <tr>
                            <td>${d.month} ${d.year}</td>
                            <td>${d.oni.toFixed(2)}</td>
                            <td>${d.phase}</td>
                            <td>${d.intensity}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    // GDP Data summary
    if (allData.gdp && allData.gdp.length > 0) {
        const recentGDP = allData.gdp.slice(-20);
        html += `
            <h3>Recent GDP Growth (Last 20 records)</h3>
            <table>
                <thead>
                    <tr><th>Country</th><th>Year</th><th>GDP Growth %</th></tr>
                </thead>
                <tbody>
                    ${recentGDP.map(d => `
                        <tr>
                            <td>${d.country}</td>
                            <td>${d.year}</td>
                            <td>${d.gdpGrowth.toFixed(2)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    // Export buttons
    html += `
        <h3>Export Data</h3>
        <button onclick="exportToJSON('oni')">Export ONI as JSON</button>
        <button onclick="exportToJSON('gdp')">Export GDP as JSON</button>
        <button onclick="exportToJSON('all')">Export All as JSON</button>
    `;
    
    container.innerHTML = html;
};

const exportToJSON = (dataType) => {
    let dataToExport;
    let filename;
    
    if (dataType === 'all') {
        dataToExport = allData;
        filename = 'all-climate-data.json';
    } else {
        dataToExport = allData[dataType];
        filename = `${dataType}-data.json`;
    }
    
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log(`Exported ${filename}`);
};

const clearData = () => {
    allData = { oni: null, gdp: null, fishing: null, rainfall: null, temperature: null };
    document.getElementById('status-container').innerHTML = '';
    document.getElementById('data-container').innerHTML = '';
};

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('Data loader ready. Click "Load All Data" to begin.');
});
