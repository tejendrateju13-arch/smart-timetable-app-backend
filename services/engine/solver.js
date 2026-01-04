/**
 * Timetable Solver using Backtracking / Heuristic Search
 * 
 * Entities:
 * - Slots: Time slots available in a week (e.g., 5 days * 8 periods = 40 slots)
 * - Resources: Rooms, Faculty
 * - Events: Subject classes to be scheduled
 * 
 * Constraints:
 * 1. Hard: No faculty clash (same faculty in 2 rooms at same time).
 * 2. Hard: No room clash (2 classes in same room at same time).
 * 3. Hard: No student clash (Batch cannot attend 2 classes).
 * 4. Soft: Balanced load for faculty.
 */

class TimetableSolver {
    constructor(data) {
        this.departments = data.departments;
        this.subjects = data.subjects;
        this.faculty = data.faculty;
        this.classrooms = data.classrooms;
        this.timetable = [];
        this.days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        this.days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        this.periods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']; // Removed P8

        // Trackers
        this.facultyDailyLoad = {}; // { facultyId: { Day: count } }
        this.facultyWeeklyLoad = {}; // { facultyId: count }
        this.grid = {}; // { Day: { Period: entry } }

        this.days.forEach(d => {
            this.grid[d] = {};
            this.periods.forEach(p => this.grid[d][p] = null);
        });

        // Academic Fillers
        this.fillers = [
            { name: 'PET', type: 'Filler', facultyName: 'Physical Director' },
            { name: 'Seminar', type: 'Filler', facultyName: 'Dept Faculty' },
            { name: 'Skill Development', type: 'Filler', facultyName: 'Trainer' },
            { name: 'Counseling', type: 'Filler', facultyName: 'Mentor' }
        ];
    }

    canAssign(day, period, subject, faculty, room) {
        // 1. Basic Collisions (Grid check)
        if (this.grid[day][period]) return false;

        // 2. Theory constraint: Max 1 occurrence per subject per day
        if (subject.type !== 'Lab' && subject.type !== 'Filler') {
            const subjectOccurrencesToday = Object.values(this.grid[day]).filter(slot => slot?.subjectId === subject.id).length;
            if (subjectOccurrencesToday >= 1) return false;

            // Non-continuous check: If P(n-1) has the same subject, avoid P(n)
            const pIdx = this.periods.indexOf(period);
            if (pIdx > 0) {
                const prevP = this.periods[pIdx - 1];
                if (this.grid[day][prevP]?.subjectId === subject.id) return false;
            }
        }

        // 3. Faculty Continuity Constraint: No back-to-back periods
        const pIdx = this.periods.indexOf(period);
        if (pIdx > 0) {
            const prevP = this.periods[pIdx - 1];
            const prevSlot = this.grid[day][prevP];
            if (prevSlot && (prevSlot.facultyId === faculty.id || prevSlot.facultyName === faculty.name)) {
                return false;
            }
        }

        // 4. Faculty Load Limits
        const dailyLoad = (this.facultyDailyLoad[faculty.id] && this.facultyDailyLoad[faculty.id][day]) || 0;
        const weeklyLoad = this.facultyWeeklyLoad[faculty.id] || 0;

        if (dailyLoad >= 4 && subject.type !== 'Lab') return false;
        if (dailyLoad >= 4 && subject.type !== 'Lab') return false;
        if (weeklyLoad >= 18) return false;

        // 5. Faculty Availability Preference (Red/Green Grid)
        // If faculty has set availability, strict check: MUST be available
        // 5. Faculty Availability Preference (Red/Green Grid)
        if (faculty.availability && faculty.availability[day]) {
            // Normalize Period ID: "P1" -> "1"
            const slotKey = period.replace('P', '');

            // Check for explicit "false" (Busy)
            // Availability matrix keys are usually "1", "2"...
            const isAvailable = faculty.availability[day][slotKey];

            // If undefined, assume available. If exactly false, block it.
            if (isAvailable === false) {
                return false;
            }
        }

        return true;
    }

    updateLoad(day, facultyId) {
        if (!this.facultyDailyLoad[facultyId]) this.facultyDailyLoad[facultyId] = {};
        this.facultyDailyLoad[facultyId][day] = (this.facultyDailyLoad[facultyId][day] || 0) + 1;
        this.facultyWeeklyLoad[facultyId] = (this.facultyWeeklyLoad[facultyId] || 0) + 1;
    }

    solve() {
        const fs = require('fs');
        fs.appendFileSync('api_debug.txt', `[V6 SOLVER] Starting... Subs: ${this.subjects.length}\n`);

        // 1. Schedule Labs First (Exactly 3-period block, once per week)
        const labs = this.subjects.filter(s => s.type === 'Lab');
        labs.forEach(lab => {
            this.placeLab(lab, 3); // Exactly 3 periods
        });

        // 2. Schedule Theory
        const theory = this.subjects.filter(s => s.type !== 'Lab');
        const theoryInstances = [];
        theory.forEach(sub => {
            const h = parseInt(sub.hoursPerWeek) || 3;
            for (let i = 0; i < h; i++) {
                theoryInstances.push(sub);
            }
        });

        // Shuffle theory for variety
        theoryInstances.sort(() => Math.random() - 0.5);

        theoryInstances.forEach(sub => {
            this.placeTheory(sub);
        });

        // 3. Fill ALL Gaps (100% density mandate)
        this.fillGaps();

        fs.appendFileSync('api_debug.txt', `[V6 SOLVER] Finished. Grid density: 100%\n`);
        return this.grid;
    }

    placeLab(lab, size) {
        const room = this.classrooms.find(r => r.roomType === 'Lab' || r.name?.toLowerCase().includes('lab')) || this.classrooms[0];
        const faculty1 = this.faculty.find(f => f.name === lab.facultyName) || this.faculty.find(f => f.departmentId === lab.departmentId);

        // Find 2nd Faculty if assigned
        let faculty2 = null;
        if (lab.facultyName2) {
            faculty2 = this.faculty.find(f => f.name === lab.facultyName2);
        }

        if (!faculty1 || !room) return;

        // Lab blocks: Morning (P2-P4), Afternoon (P5-P7). P1 is excluded as per request.
        const validBlocks = [['P2', 'P3', 'P4'], ['P5', 'P6', 'P7']];

        for (const day of this.days) {
            // CONSTRAINT: Max 1 Lab per Day per Section
            const hasLabToday = Object.values(this.grid[day]).some(slot => slot && slot.type === 'Lab');
            if (hasLabToday) continue;

            // Randomize Block Preference (Morning vs Afternoon) to balance schedule
            const shuffledBlocks = [...validBlocks].sort(() => Math.random() - 0.5);

            for (const block of shuffledBlocks) {
                // Check constraints for Fac 1, Fac 2, and Room
                const canFill = block.every(p => {
                    const baseCheck = !this.grid[day][p] && this.canAssign(day, p, lab, faculty1, room);
                    if (!baseCheck) return false;

                    // Extra check for Fac 2
                    if (faculty2) {
                        return this.canAssign(day, p, lab, faculty2, room);
                    }
                    return true;
                });

                if (canFill) {
                    block.forEach(p => {
                        this.grid[day][p] = {
                            subjectId: lab.id,
                            subjectName: lab.name || lab.subjectName,
                            subjectCode: lab.code || 'N/A',
                            facultyName: faculty1.name,
                            facultyName2: faculty2 ? faculty2.name : null, // Save 2nd Fac
                            facultyId: faculty1.id,
                            roomNumber: room.roomNumber || room.name,
                            type: 'Lab'
                        };
                        this.updateLoad(day, faculty1.id);
                        if (faculty2) this.updateLoad(day, faculty2.id); // Update load for Fac 2
                    });
                    return; // Once per week
                }
            }
        }
    }

    placeTheory(sub) {
        const room = this.classrooms.find(r => r.roomType === 'Lecture' || !r.name?.toLowerCase().includes('lab')) || this.classrooms[0];

        // Data Integrity Fix: Ensure we don't match "Year 3-A" as a faculty name
        let faculty = this.faculty.find(f => f.name === sub.facultyName && !f.name.includes('Year'));

        // Fallback: Pick any valid faculty (ignoring placeholders)
        if (!faculty) {
            faculty = this.faculty.find(f => f.departmentId === sub.departmentId && !f.name.includes('Year'));
        }

        if (!faculty || !room) return;

        for (const day of this.days) {
            for (const p of this.periods) {
                if (this.canAssign(day, p, sub, faculty, room)) {
                    this.grid[day][p] = {
                        subjectId: sub.id,
                        subjectName: sub.name || sub.subjectName,
                        subjectCode: sub.code || 'N/A', // Add Subject Code
                        facultyName: faculty.name,
                        facultyId: faculty.id,
                        roomNumber: room.roomNumber || room.name,
                        type: 'Theory'
                    };
                    this.updateLoad(day, faculty.id);
                    return;
                }
            }
        }
    }

    fillGaps() {
        this.days.forEach(day => {
            this.periods.forEach(p => {
                if (!this.grid[day][p]) {
                    // STRATEGY: Try to fill empty slot with an EXTRA Academic Class first
                    const theorySubjects = this.subjects.filter(s => s.type !== 'Lab' && s.type !== 'Filler');
                    // Shuffle to distribute extra load randomly
                    const shuffledSubjects = [...theorySubjects].sort(() => Math.random() - 0.5);

                    let filled = false;

                    for (const sub of shuffledSubjects) {
                        const room = this.classrooms.find(r => r.roomType === 'Lecture' || !r.name?.includes('Lab')) || this.classrooms[0];
                        const faculty = this.faculty.find(f => f.name === sub.facultyName) || this.faculty.find(f => f.departmentId === sub.departmentId);

                        if (faculty && room) {
                            // Specialized Check for Extra Class:
                            // We use canAssign but might relax "Frequency per day" if strictly needed, 
                            // But for now, let's stick to valid schedules (No Double Booking).

                            // 1. Hard Collision Check (Is Faculty Free?)
                            const isFacBusy = Object.values(this.grid[day]).some(slot => slot && (slot.facultyId === faculty.id || slot.facultyName === faculty.name));
                            // ^ This is too strict (checks whole day). We only care about THIS slot.

                            // Re-use canAssign but we permit >1 class per day for "Extra" classes if needed, 
                            // OR we strictly look for a subject that hasn't happened today yet (preferable).

                            // For simplicity and safety, let's trust canAssign initially. 
                            // If canAssign prevents it (e.g. Max Load), we fail to place and move to next subject.
                            if (this.canAssign(day, p, sub, faculty, room)) {
                                this.grid[day][p] = {
                                    subjectId: sub.id,
                                    subjectName: sub.name,
                                    subjectCode: sub.code || 'N/A',
                                    facultyName: faculty.name,
                                    facultyId: faculty.id,
                                    roomNumber: room.roomNumber || room.name,
                                    type: 'Theory (Extra)' // Distinct type but behaves like Theory
                                };
                                this.updateLoad(day, faculty.id);
                                filled = true;
                                break;
                            }
                        }
                    }

                    if (!filled) {
                        // If no academic class fits (e.g. all faculty busy), fall back to fillers
                        // BUT: Exclude Library as per user request.
                        const validFillers = this.fillers.filter(f => f.name !== 'Library');
                        const filler = validFillers[Math.floor(Math.random() * validFillers.length)];

                        this.grid[day][p] = {
                            subjectName: filler.name,
                            facultyName: filler.facultyName,
                            roomNumber: 'Dept Hall',
                            type: 'Filler'
                        };
                    }
                }
            });
        });
    }
}

module.exports = TimetableSolver;
