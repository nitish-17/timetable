# School Timetable Generator

This document captures our discussion, ideas, and feature refinements for the school timetable generator app.

## 1. Core Concept

An automated or semi-automated school timetable scheduler designed to help school administrators (such as an In-charge/Headmistress) easily create weekly timetables for classes 6 to 10. The goal is to reduce manual workload by at least 50%, preventing late-night planning sessions.

## 2. Target Audience & Problem Statement

* **Primary User**: School Headmistress / Academic In-charge.
* **Problem**: Generating school timetables manually is a highly complex, multi-constrained optimization problem (juggling teacher availability, class sections, subjects, room constraints, maximum consecutive hours, etc.). It takes substantial time and leads to cognitive fatigue.

## 3. School Timetable Structure

Based on the initial design conversation, the scheduler should accommodate the following structure:
* **Classes/Grades**: 5 grades (Grade 6 to Grade 10)
* **Sections**: Up to 5 sections per grade (A to E), totaling 25 class sections.
* **Days per Week**: 6 days.
* **Periods per Day**: 10 periods.
* **Weekly Slots per Section**: 60 slots (10 periods × 6 days).
* **Total School Slots**: 1,500 weekly slots to allocate (25 sections × 60 slots).

Each slot in a section's timetable must be assigned a **Teacher** (who teaches a specific **Subject**). We cannot allocate subjects in isolation, as that would make it impossible to assign teachers without clashes. Instead, the assignment must map (Class-Section, Day, Period) to a specific (Teacher, Subject).

## 4. Constraints & Rules

1. **No Teacher Clashing (Hard Constraint)**: A teacher cannot be assigned to two different class-sections during the same (Day, Period) slot.
2. **Subject Period Requirements**: For each class-section, the total number of periods assigned to teachers of a particular subject must match the section's weekly requirement for that subject.
3. **Teacher Weekly Workload**: Each teacher has a maximum number of periods they can teach per week (weekly load limit).
4. **Dual-View Consistency**:
   - **Class View**: For each class-section, a grid of Days × Periods, where each slot is filled by a teacher/subject.
   - **Teacher View**: For each teacher, a grid of Days × Periods, where each slot shows the class-section they are teaching (or "Free").
   - A change in the Class View must automatically update the Teacher View and vice-versa, with active validation checking for clashes in real time.

## 5. Key Functional Features (Phase 1: Configurable Manual Builder)

1. **High Configurability Dashboard**:
   - **School Calendar Configuration**: Customise Days of the week (e.g. Mon–Sat) and number of Periods per day (e.g. 10 periods).
   - **Classes & Sections**: Dynamically add/edit grades and sections (e.g., Grade 6 to 10, Sections A to E).
   - **Subjects & Teachers**: Manage subjects list and teachers list (with subject mapping and max weekly hours).
   - **Section Subject Allocation Rules**: Configure exactly how many periods of which subjects are required for each class-section individually.
2. **Interactive Timetable Grid (Dual-View)**:
   - **Class-Section View**: Interactive grid allowing manual allocation of teacher/subject for each slot.
   - **Teacher View**: View the schedule for any selected teacher.
3. **Real-time Conflict Validation**:
   - Visually flag clashes immediately (e.g. teacher clashing).
   - Provide summary indicators of remaining subjects to allocate for the selected section.
4. **Auto-Suggestion Engine**:
   - Suggest free and eligible teachers when scheduling a slot to make manual entry fast.
5. **Client-Side Persistence & Portability**:
   - **Database**: Use **Dexie.js** for browser storage.
   - **Import/Export**: JSON files for importing/exporting configurations and timetables.
6. **Printable Document Generation**:
   - Export schedules to PDF or Excel.

## 6. Discussion History & Refinements

- **2026-05-26**: Core concept defined. The app aims to help a school HM schedule timetables for classes 6–10.
- **2026-05-26**: Structural specifications identified (5 grades, 5 sections/grade, 10 periods/day, 6 days/week, total 1500 slots).
- **2026-05-26**: Decided on coupled Subject/Teacher allocation and a Semi-automated/Interactive Builder interface.
- **2026-05-26**: Specified client-side persistence using Dexie.js, JSON import/export, and PDF/Excel printable exports.
- **2026-05-26**: Refined strategy: Focus on building a fully configurable manual builder first (everything customisable: days, periods, classes, subjects, requirements), ensuring clean data structures to ease the addition of automated solvers later.
- **2026-05-26**: Added Subject Requirements Presets functionality:
  - Users can enable/disable subjects using checkmarks.
  - Users assign period counts to enabled subjects, showing a live total vs. the target period count (e.g. 60).
  - Presets can be saved and reused across multiple sections.
  - Defined a default preset with specific values (detailed in Section 7).

## 7. Default Subject Allocation Preset

A default preset will be provided with the following allocations. For unassigned subjects, the system will allocate random counts such that the total equals exactly 60 periods (assuming standard 60-period load):

| Subject | Base Allocation | Random Allocation (to reach 60) |
|---|---|---|
| 1st language | 7 | 7 |
| 2nd language | 6 | 6 |
| english | 8 | 8 |
| math | 13 | 13 |
| physics | 5 | 5 |
| biology | 4 | 4 |
| science | 0 | 0 |
| social | 8 | 8 |
| pt | 2 | 2 |
| computer | 2 | 2 |
| lifeskills | 1 | 1 |
| iit math | *unassigned* | 1 |
| iit physics | *unassigned* | 1 |
| iit chemistry | *unassigned* | 1 |
| communication | *unassigned* | 1 |
| neet | *unassigned* | 0 |
| karate | *unassigned* | 0 |
| dance | *unassigned* | 0 |
| yoga | *unassigned* | 0 |
| robotics | *unassigned* | 0 |
| **Total** | **56** | **60** |

## 8. User Workflow Steps

To ensure ease of use and prevent cognitive fatigue, the application will follow this step-by-step workflow:

1. **Onboarding Setup (First-Time User)**:
   - On initial launch, a setup wizard prompts the user to enter basic school configuration:
     - Number of classes/grades
     - Number of sections per class
     - Number of periods per day
     - Number of days per week
   - The app's database is initialized with these grids, creating empty templates for all sections.

2. **Subject Configuration per Class-Section**:
   - For each class-section, the user configures weekly subject demands.
   - They can apply, tweak, or save presets (using the checkmark/period-count form described in Section 7).
   - These configurations serve as constraint trackers when building the timetable.

3. **Teacher Management & Directory**:
   - The user adds teachers, specifying:
     - **Short Name** (for table view compactness)
     - **Full Name**
     - **Subjects** they are qualified to teach
     - **Classes & Sections** they are allowed to teach
     - **Workload Limits** (Min and Max periods per week)

4. **Dual-View Interactive Grid Builder**:
   - The user selects a specific **Teacher** to schedule.
   - The interface renders a side-by-side Dual-View grid:
     - **Left Column: Class-Section Timetable**: Contains a dropdown to choose the active Class-Section, showing its Day × Period grid. Clicking a slot assigns the selected teacher to it.
     - **Right Column: Teacher Timetable**: Shows the selected teacher's Day × Period schedule. It automatically populates with any class-section assignments made for this teacher (allowing the HM to see breaks, visual spacing, and gaps).
   - **Real-Time Constraint Headers**:
     - *Above Left Table (Class)*: Displays status indicator of subjects allocated vs. required (e.g., "Math: 5/13 periods assigned").
     - *Above Right Table (Teacher)*: Displays the teacher's current workload vs. min/max limit (e.g., "Weekly load: 18/24 periods").
   - **Obvious Error Prevention**:
     - Warn and prevent assigning a teacher to a class-section slot if that teacher is already busy with another class at that time (Clash Prevention).
     - Prevent assigning a teacher to a slot if another teacher is already scheduled in it, prompting to overwrite or clear first.

5. **Export & Backup**:
   - Once complete, download JSON backups and export high-quality printable layouts for either class-sections or individual teachers.

- **2026-05-26**: Documented detailed step-by-step user workflow (Onboarding -> Subject Config -> Teacher Entry -> Dual-View Timetable -> Export).
- **2026-05-26**: Added Tech Stack (React, Vite, Zustand, Dexie.js) and UX/UI requirements (high-density compact layouts, minimal borders/shadows, resizable dual-view divider, PWA offline support).

## 9. Technology Stack

* **Build & Dev Tooling**: React with Vite for fast builds and hot module replacement.
* **State Management**: **Zustand** for lightweight, performant client-side state.
* **Local Persistence**: **Dexie.js** (IndexedDB wrapper) for handling relational timetable schemas, onboarding state, configurations, and draft timetables.
* **Backup & Migration**: Custom import/export module to parse and generate Dexie.js database backups as `.json` files.
* **Reporting & Exports**: Client-side packages to generate printable sheets (e.g. XLSX/CSV for spreadsheet manipulation and PDF generation for printouts).
* **PWA & Offline Capability**: Full service worker caching, manifest registration, and IndexedDB storage to support running entirely offline.

## 10. UI/UX & Styling Requirements

* **High-Density Compact Layout**:
  - Minimum padding and margins.
  - Small, legible typography to maximize visible data.
  - Efficient usage of space to fit the multi-grade/multi-teacher schedules without excessive scrolling.
  - Space-saving, low-profile dialogs/modals (minimizing screen occlusion).
* **Clean, Minimal Aesthetics**:
  - A healthy balance between light borders and very soft shadows.
  - Minimalistic aesthetic to keep the focus purely on data layout and constraints.
  - **Light Theme Only**: Use a clean light theme reminiscent of Google's Antigravity app (using clean whites, subtle cool grays like `#f8f9fa` or `#f1f3f4`, thin borders like `#dadce0`, and high-contrast Google blue accents like `#1a73e8` for focus and highlights).
* **Adjustable Dual-View Divider**:
  - The splitter between the Left Panel (Class Timetable) and Right Panel (Teacher Timetable) must be resizable/adjustable via dragging to let the HM customize their screen estate depending on monitor size.

- **2026-05-26**: Added light theme constraint modeled after Google's Antigravity app UI styling.







