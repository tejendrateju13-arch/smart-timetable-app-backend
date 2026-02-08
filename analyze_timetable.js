const { db } = require('./config/firebase');
const fs = require('fs');

function log(msg) {
    console.log(msg);
    fs.appendFileSync('final_analysis.txt', msg + '\n');
}

async function analyzeTimetable() {
    // Clear previous log
    fs.writeFileSync('final_analysis.txt', '');

    log('Fetching latest timetable...');
    const snapshot = await db.collection('timetables')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) {
        log('No timetable found.');
        return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Check Candidates (Generated Schedules)
    if (!data.candidates || data.candidates.length === 0) {
        log('No candidates found in timetable.');
        return;
    }

    const schedule = data.candidates[0].schedule; // Analyze the first candidate (usually the best)

    log(`Analyzing Schedule (Dept: ${data.departmentId}, Year: ${data.year}, Created: ${data.createdAt.toDate().toISOString()})`);

    let deepLearningLabFound = false;
    let duplicatesFound = false;

    // Iterate Days
    for (const day of Object.keys(schedule)) {
        const slots = schedule[day];
        const subjectCounts = {};

        log(`\n--- ${day} ---`);
        for (const period of Object.keys(slots)) {
            const slot = slots[period];
            if (!slot) continue;

            // Check for Lab
            if (slot.subjectName.includes('Deep Learning Lab') || slot.subjectCode === '23A30602P') {
                deepLearningLabFound = true;
                log(`[FOUND] Deep Learning Lab at ${period} (${slot.facultyName})`);
            }

            // Check for Repetitions
            // Strictly check for THEORY repetitions (>1 per day)
            // Labs are expected to have 3 periods, so ignore them here.
            if (slot.type !== 'Filler' && slot.type !== 'Lab') {
                const subName = slot.subjectName;
                if (!subjectCounts[subName]) subjectCounts[subName] = [];
                subjectCounts[subName].push(period);
            }

            log(`  ${period}: ${slot.subjectName} (${slot.type})`);
        }

        // Report Duplicates
        for (const [sub, periods] of Object.entries(subjectCounts)) {
            if (periods.length > 1) {
                log(`[WARNING] DUPLICATE THEORY: "${sub}" appears ${periods.length} times on ${day} at ${periods.join(', ')}`);
                duplicatesFound = true;
            }
        }
    }

    log('\n--- ANALYSIS RESULT ---');
    if (deepLearningLabFound) {
        log('✅ Deep Learning Lab is PRESENT.');
    } else {
        log('❌ Deep Learning Lab is MISSING.');
    }

    if (duplicatesFound) {
        log('❌ THEORY DUPLICATES FOUND (Subject > 1 per day).');
    } else {
        log('✅ NO THEORY DUPLICATES FOUND.');
    }
}

analyzeTimetable().catch(console.error);
