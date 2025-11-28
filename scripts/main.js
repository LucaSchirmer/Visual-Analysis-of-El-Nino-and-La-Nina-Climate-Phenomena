// ============================================
// GLOBAL DATA DECOMPRESSION HELPER
// ============================================

window.loadDecompressedBlob = async function(blobString, type = 'csv') {
    if (!blobString) {
        throw new Error("Data blob is undefined or empty");
    }

    // Decode Base64 to binary
    const binaryString = atob(blobString);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Decompress using browser's native DecompressionStream
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const response = new Response(stream);

    // Parse based on type
    if (type === 'json') {
        return await response.json();
    } else if (type === 'csv') {
        const text = await response.text();
        return d3.csvParse(text);
    }
};

// ============================================
// DATA VARIABLES MAPPING
// ============================================

window.dataBlobs = {
    'temperature': typeof data_temperature_by_country !== 'undefined' ? data_temperature_by_country : null,
    'rainfall': typeof data_rainfall_by_country !== 'undefined' ? data_rainfall_by_country : null,
    'sst': typeof data_global_sst !== 'undefined' ? data_global_sst : null,
    'fishing': typeof data_fishing_by_country_year !== 'undefined' ? data_fishing_by_country_year : null,
    'oni': typeof data_oni_monthly !== 'undefined' ? data_oni_monthly : null
};

console.log('Data blobs loaded:', window.dataBlobs);
console.log('loadDecompressedBlob function defined:', typeof window.loadDecompressedBlob);

// ============================================
// PAGE INITIALIZATION
// ============================================

document.addEventListener("DOMContentLoaded", async function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    console.log('Current page detected:', currentPage);
    
    try {
        if (currentPage === 'map.html' || currentPage.includes('map')) {
            console.log('Initializing map page...');
            await createWorldMap();
            console.log('Map initialized, now initializing timeline...');
            await createTimelineScale(true);
            console.log('Timeline initialized successfully!');
        } else if (currentPage === 'scatterplot.html' || currentPage.includes('scatter')) {
            console.log('Initializing scatterplot page...');
            await createScatterPlot();
        } else {
            console.log('Initializing home page...');
        }
    } catch (error) {
        console.error('Error during page initialization:', error);
    }
});
