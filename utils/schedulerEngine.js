class SchedulerEngine {
    constructor(subjects, faculty, classrooms, config = {}) {
        this.subjects = subjects;
        this.faculty = faculty;
        this.classrooms = classrooms;

        // Advanced Configuration
        this.config = {
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            periodsPerDay: 7, // 1, 2, Short Break, 3, 4, Lunch, 5, 6, 7
            breakpoints: [2, 4], // Break after 2nd period, Lunch after 4th period
            ...config
        };
        this.fillers = [
            { name: 'Tutorial', type: 'Academic Pillar' },
            { name: 'Seminar', type: 'Academic Pillar' },
            { name: 'Skill Development', type: 'Vocational' },
            { name: 'Library Hour', type: 'Self Study' },
            { name: 'Mentoring / Counseling', type: 'Support' }
        ];
    }

    generateCandidates(count = 3) {
        console.log("Scheduler Engine V2: Generating Candidates...");
        const candidates = [];
        for (let i = 0; i < count; i++) {
            const flatSchedule = this.generateSingleSchedule();
            const evaluation = this.evaluateSchedule(flatSchedule);

            // Convert flat array to structured object { Day: { SlotId: Entry } }
            const structuredSchedule = {};
            flatSchedule.forEach(item => {
                if (!structuredSchedule[item.day]) structuredSchedule[item.day] = {};

                // key mapping: 1->P1, 'SB'->'SB'
                let key = item.slot;
                if (typeof item.slot === 'number') key = 'P' + item.slot;

                structuredSchedule[item.day][key] = item;
            });

            candidates.push({
                id: i + 1,
                schedule: structuredSchedule,
                score: evaluation.score,
                conflicts: evaluation.conflicts || [] // Ensure array
            });
        }
        return candidates.sort((a, b) => a.score - b.score);
    }

    generateSingleSchedule() {
        let schedule = [];
        const { days, periodsPerDay } = this.config;

        const facultyDailyLoad = {};
        const facultyWeeklyLoad = {};
        const subjectDailyCount = {}; // { day: { subjectId: count } }
        const subjectWeeklyCount = {}; // { subjectId: count }

        days.forEach(d => {
            facultyDailyLoad[d] = {};
            subjectDailyCount[d] = {};
        });

        this.faculty.forEach(f => facultyWeeklyLoad[f.name] = 0);
        this.subjects.forEach(s => subjectWeeklyCount[s.id] = 0);

        const isFacultyFree = (day, slot, facultyName) => {
            if ((facultyDailyLoad[day][facultyName] || 0) >= 2) return false;
            if ((facultyWeeklyLoad[facultyName] || 0) >= 6) return false;
            const prev = schedule.find(s => s.day === day && (s.slot === slot - 1 || (s.type === 'Lab' && slot - 1 >= s.slot && slot - 1 < s.slot + s.duration)));
            if (prev && prev.facultyName === facultyName) return false;
            return true;
        };

        const labs = this.subjects.filter(s => s.type === 'Lab' || s.name.toLowerCase().includes('lab'));
        const theory = this.subjects.filter(s => !labs.includes(s));

        // 1. Labs (Continuous 3 blocks)
        labs.forEach(lab => {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 50) {
                const randomDay = days[Math.floor(Math.random() * days.length)];
                const startPeriod = Math.random() > 0.5 ? 5 : 1;

                // Check Faculty Load for the week
                if ((facultyWeeklyLoad[lab.facultyName] || 0) + 3 > 6) {
                    break; // Cannot place this lab without exceeding weekly limit
                }

                const isOccupied = (p) => schedule.find(s => s.day === randomDay && p >= s.slot && p < s.slot + (s.duration || 1));
                if (!isOccupied(startPeriod) && !isOccupied(startPeriod + 1) && !isOccupied(startPeriod + 2)) {
                    // Find actual faculty record to get ID
                    const facultyRec = this.faculty.find(f => f.name === lab.facultyName);

                    schedule.push({
                        day: randomDay, slot: startPeriod, type: 'Lab', duration: 3,
                        subjectId: lab.id, subjectName: lab.name,
                        facultyName: lab.facultyName, facultyId: facultyRec?.id || facultyRec?.uid || 'N/A',
                        roomId: 'G-101', roomNumber: 'G-101'
                    });
                    facultyDailyLoad[randomDay][lab.facultyName] = (facultyDailyLoad[randomDay][lab.facultyName] || 0) + 3;
                    facultyWeeklyLoad[lab.facultyName] = (facultyWeeklyLoad[lab.facultyName] || 0) + 3;
                    placed = true;
                }
                attempts++;
            }
        });

        // 2. Pillars (Library, PET, Activity) - Exactly 1 per week each
        const pillarSubjects = [
            { id: 'lib', name: 'Library', type: 'Pillar' },
            { id: 'pet', name: 'P.E.T', type: 'Pillar' },
            { id: 'act', name: 'Other Activity', type: 'Pillar' }
        ];

        pillarSubjects.forEach(pSub => {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 30) {
                const day = days[Math.floor(Math.random() * days.length)];
                const slot = Math.floor(Math.random() * 3) + 5; // Usually afternoon (P5, P6, P7)
                const isOccupied = schedule.find(s => s.day === day && slot >= s.slot && slot < s.slot + (s.duration || 1));
                if (!isOccupied) {
                    schedule.push({
                        day, slot, type: 'Pillar', subjectName: pSub.name,
                        facultyName: 'Resident Faculty', facultyId: 'RESIDENT',
                        roomId: 'Activity Area', roomNumber: 'AA'
                    });
                    placed = true;
                }
                attempts++;
            }
        });

        // 3. Theory (1 per day, 6 per week)
        days.forEach(day => {
            for (let p = 1; p <= periodsPerDay; p++) {
                if (p === 3 && this.config.breakpoints.includes(2)) continue; // Break

                const isOccupied = schedule.find(s => s.day === day && p >= s.slot && p < s.slot + (s.duration || 1));
                if (!isOccupied) {
                    // Find a theory subject that hasn't been taught today and needs more hours this week
                    const validTheory = theory.find(sub => {
                        const weeklyDone = subjectWeeklyCount[sub.id] || 0;
                        const dailyDone = subjectDailyCount[day][sub.id] || 0;
                        return weeklyDone < 6 && dailyDone === 0 && isFacultyFree(day, p, sub.facultyName);
                    });

                    if (validTheory) {
                        const facultyRec = this.faculty.find(f => f.name === validTheory.facultyName);
                        schedule.push({
                            day, slot: p, type: 'Theory',
                            subjectId: validTheory.id, subjectName: validTheory.name,
                            facultyName: validTheory.facultyName, facultyId: facultyRec?.id || facultyRec?.uid || 'N/A',
                            roomId: 'LH-01', roomNumber: 'LH-01'
                        });
                        facultyDailyLoad[day][validTheory.facultyName] = (facultyDailyLoad[day][validTheory.facultyName] || 0) + 1;
                        facultyWeeklyLoad[validTheory.facultyName] = (facultyWeeklyLoad[validTheory.facultyName] || 0) + 1;
                        subjectDailyCount[day][validTheory.id] = 1;
                        subjectWeeklyCount[validTheory.id] = (subjectWeeklyCount[validTheory.id] || 0) + 1;
                    } else {
                        // FILLER
                        const filler = this.fillers[Math.floor(Math.random() * this.fillers.length)];
                        schedule.push({
                            day, slot: p, type: 'Filler',
                            subjectName: filler.name, facultyName: 'Resident Staff', facultyId: 'RESIDENT',
                            roomId: 'Dept Area', roomNumber: 'DA'
                        });
                    }
                }
            }
        });

        return schedule;
    }

    evaluateSchedule(schedule) {
        let score = 100;
        let conflicts = [];
        const { days } = this.config;

        days.forEach(day => {
            const daily = schedule.filter(s => s.day === day);
            const academic = daily.filter(s => s.type === 'Theory' || s.type === 'Lab').length;
            if (academic < 3) {
                score -= 10;
                conflicts.push(`Light academic schedule on ${day} (${academic} classes)`);
            }
        });

        // Additional checks for V3 constraints
        const facultyWeeklyLoad = {};
        const subjectWeeklyCount = {};
        const subjectDailyCount = {}; // { day: { subjectId: count } }
        const facultyDailyLoad = {};

        days.forEach(d => {
            facultyDailyLoad[d] = {};
            subjectDailyCount[d] = {};
        });
        this.faculty.forEach(f => facultyWeeklyLoad[f.name] = 0);
        this.subjects.forEach(s => subjectWeeklyCount[s.id] = 0);

        schedule.forEach(item => {
            if (item.facultyName && item.type !== 'Filler' && item.type !== 'Pillar') { // Fillers/Pillars don't count towards faculty load
                const duration = item.duration || 1;
                facultyDailyLoad[item.day][item.facultyName] = (facultyDailyLoad[item.day][item.facultyName] || 0) + duration;
                facultyWeeklyLoad[item.facultyName] = (facultyWeeklyLoad[item.facultyName] || 0) + duration;
            }
            if (item.subjectId) {
                subjectDailyCount[item.day][item.subjectId] = (subjectDailyCount[item.day][item.subjectId] || 0) + 1;
                subjectWeeklyCount[item.subjectId] = (subjectWeeklyCount[item.subjectId] || 0) + 1;
            }
        });

        // Faculty constraints
        for (const day of days) {
            for (const facultyName in facultyDailyLoad[day]) {
                if (facultyDailyLoad[day][facultyName] > 2) {
                    score -= 15;
                    conflicts.push(`Faculty ${facultyName} has more than 2 periods on ${day} (${facultyDailyLoad[day][facultyName]})`);
                }
            }
        }
        for (const facultyName in facultyWeeklyLoad) {
            if (facultyWeeklyLoad[facultyName] > 6) {
                score -= 20;
                conflicts.push(`Faculty ${facultyName} has more than 6 periods in the week (${facultyWeeklyLoad[facultyName]})`);
            }
        }

        // Subject constraints (Theory)
        this.subjects.filter(s => s.type !== 'Lab').forEach(sub => {
            if (subjectWeeklyCount[sub.id] !== 6) {
                score -= 10;
                conflicts.push(`Subject ${sub.name} has ${subjectWeeklyCount[sub.id] || 0} periods instead of 6 for the week.`);
            }
            days.forEach(day => {
                if ((subjectDailyCount[day][sub.id] || 0) > 1) {
                    score -= 5;
                    conflicts.push(`Subject ${sub.name} has more than 1 period on ${day}.`);
                }
            });
        });

        // Pillar subjects (Library, PET, Activity) - exactly 1 per week
        const pillarSubjects = ['Library', 'P.E.T', 'Other Activity'];
        pillarSubjects.forEach(pName => {
            const count = schedule.filter(s => s.type === 'Pillar' && s.subjectName === pName).length;
            if (count !== 1) {
                score -= 10;
                conflicts.push(`${pName} has ${count} occurrences instead of 1 for the week.`);
            }
        });

        // No continuous classes for faculty (re-check, as it's a hard constraint in generation)
        schedule.forEach(item => {
            if (item.type !== 'Filler' && item.type !== 'Pillar' && item.facultyName && typeof item.slot === 'number') {
                const nextSlot = item.slot + (item.duration || 1);
                const nextItem = schedule.find(s => s.day === item.day && s.slot === nextSlot && s.facultyName === item.facultyName);
                if (nextItem) {
                    score -= 5; // Should ideally not happen if generation is perfect
                    conflicts.push(`Faculty ${item.facultyName} has continuous classes on ${item.day} at slot ${item.slot} and ${nextSlot}.`);
                }
            }
        });

        return { score, conflicts };
    }
}

module.exports = SchedulerEngine;
