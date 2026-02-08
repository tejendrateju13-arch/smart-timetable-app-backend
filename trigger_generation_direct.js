const { generateTimetable } = require('./controllers/generatorController');
const fs = require('fs');

async function triggerDirectly() {
    console.log('Triggering generator directly...');
    fs.writeFileSync('api_debug.txt', '');

    const req = {
        body: {
            departmentId: 'CQMKzw3UW8pTVlH1B9kl',
            year: 3,
            semester: 6,
            section: 'A'
        }
    };

    const res = {
        status: (code) => {
            console.log(`Response Status: ${code}`);
            return res;
        },
        json: (data) => {
            console.log('Response Data:', JSON.stringify(data, null, 2));
            return res;
        }
    };

    try {
        await generateTimetable(req, res);
    } catch (error) {
        console.error('Direct Trigger Failed:', error);
    }
}

triggerDirectly();
