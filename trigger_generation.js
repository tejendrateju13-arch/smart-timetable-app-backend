const fs = require('fs');

async function triggerGeneration() {
    try {
        console.log('Triggering timetable generation...');
        // Clear debug log first
        fs.writeFileSync('api_debug.txt', '');

        const payload = {
            departmentId: 'CQMKzw3UW8pTVlH1B9kl',
            year: 3,
            semester: 6,
            section: 'A'
        };

        const res = await fetch('http://localhost:5000/api/generator/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log('Generation Response:', res.status, data.message);
    } catch (error) {
        console.error('Generation Failed:', error.message);
    }
}

triggerGeneration();
