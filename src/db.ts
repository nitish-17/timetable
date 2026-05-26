import Dexie, { type Table } from 'dexie';

export interface SchoolConfig {
  id: string; // 'current'
  classes: number; // number of classes (Grade 6 to 10 is 5)
  sections: number; // number of sections (A to E is 5)
  periodsPerDay: number; // e.g., 10
  daysPerWeek: number; // e.g., 6
}

export interface Subject {
  id: string;
  name: string;
}

export interface Preset {
  id: string;
  name: string;
  allocations: Record<string, number>; // subjectId -> periodCount
  enabledSubjects: string[]; // array of subjectIds that are checked
}

export interface Teacher {
  id: string;
  shortName: string;
  fullName: string;
  subjects: string[]; // array of subjectIds they can teach
  classes: string[]; // list of classSection values they can teach, e.g., ['6A', '7B']
  minWorkload: number;
  maxWorkload: number;
}

export interface TimetableSlot {
  id: string; // composite key e.g. "6A-0-4"
  classSection: string; // e.g. "6A"
  dayIndex: number; // 0-based
  periodIndex: number; // 0-based
  teacherId: string;
  subjectId: string;
}

export interface SectionRequirement {
  classSection: string; // e.g., "6A"
  allocations: Record<string, number>; // subjectId -> periodCount
  enabledSubjects: string[];
}

export class TimetableDatabase extends Dexie {
  schoolConfig!: Table<SchoolConfig, string>;
  subjects!: Table<Subject, string>;
  presets!: Table<Preset, string>;
  teachers!: Table<Teacher, string>;
  timetable!: Table<TimetableSlot, string>;
  sectionRequirements!: Table<SectionRequirement, string>;

  constructor() {
    super('TimetableDB');
    this.version(1).stores({
      schoolConfig: 'id',
      subjects: 'id',
      presets: 'id',
      teachers: 'id, shortName',
      timetable: 'id, classSection, teacherId, [classSection+dayIndex+periodIndex]',
      sectionRequirements: 'classSection'
    });
  }
}


export const db = new TimetableDatabase();

// Default subjects list
export const DEFAULT_SUBJECTS: Subject[] = [
  { id: '1st-lang', name: '1st language' },
  { id: '2nd-lang', name: '2nd language' },
  { id: 'english', name: 'english' },
  { id: 'math', name: 'math' },
  { id: 'physics', name: 'physics' },
  { id: 'biology', name: 'biology' },
  { id: 'science', name: 'science' },
  { id: 'social', name: 'social' },
  { id: 'iit-math', name: 'iit math' },
  { id: 'iit-physics', name: 'iit physics' },
  { id: 'iit-chem', name: 'iit chemistry' },
  { id: 'neet', name: 'neet' },
  { id: 'karate', name: 'karate' },
  { id: 'dance', name: 'dance' },
  { id: 'yoga', name: 'yoga' },
  { id: 'pt', name: 'pt' },
  { id: 'computer', name: 'computer' },
  { id: 'robotics', name: 'robotics' },
  { id: 'communication', name: 'communication' },
  { id: 'lifeskills', name: 'lifeskills' }
];

// Default Preset allocations adding up to exactly 60
export const DEFAULT_PRESET_ALLOCATIONS: Record<string, number> = {
  '1st-lang': 7,
  '2nd-lang': 6,
  'english': 8,
  'math': 13,
  'physics': 5,
  'biology': 4,
  'science': 0,
  'social': 8,
  'pt': 2,
  'computer': 2,
  'lifeskills': 1,
  'iit-math': 1,
  'iit-physics': 1,
  'iit-chem': 1,
  'communication': 1,
  'neet': 0,
  'karate': 0,
  'dance': 0,
  'yoga': 0,
  'robotics': 0
};

export const DEFAULT_PRESET_ENABLED: string[] = [
  '1st-lang',
  '2nd-lang',
  'english',
  'math',
  'physics',
  'biology',
  'social',
  'pt',
  'computer',
  'lifeskills',
  'iit-math',
  'iit-physics',
  'iit-chem',
  'communication'
];

/**
 * Initializes the database with default subjects and default presets if they are not already populated.
 */
export async function initializeDefaults() {
  const subjectCount = await db.subjects.count();
  if (subjectCount === 0) {
    await db.subjects.bulkAdd(DEFAULT_SUBJECTS);
  }

  const presetCount = await db.presets.count();
  if (presetCount === 0) {
    await db.presets.add({
      id: 'default',
      name: 'Default Preset',
      allocations: DEFAULT_PRESET_ALLOCATIONS,
      enabledSubjects: DEFAULT_PRESET_ENABLED
    });
  }
}
