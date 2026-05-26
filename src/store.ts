import { create } from 'zustand';
import { db, type SchoolConfig, type Subject, type Preset, type Teacher, type TimetableSlot, type SectionRequirement, initializeDefaults } from './db';

interface ValidationResult {
  clashes: Set<string>; // set of slot IDs that are clashing
  teacherLoads: Record<string, number>; // teacherId -> total periods assigned
  classSubjectLoads: Record<string, Record<string, number>>; // classSection -> subjectId -> periods assigned
}

interface TimetableStore {
  // Database States cached in Zustand
  schoolConfig: SchoolConfig | null;
  subjects: Subject[];
  presets: Preset[];
  teachers: Teacher[];
  sectionRequirements: SectionRequirement[];
  timetable: Record<string, TimetableSlot>; // key: "classSection-dayIndex-periodIndex"

  // Selections
  selectedClassSection: string | null;
  selectedTeacherId: string | null;

  // Validation cached state
  clashingSlots: Set<string>;
  teacherLoads: Record<string, number>;
  classSubjectLoads: Record<string, Record<string, number>>;

  // Loading indicator
  isLoading: boolean;

  // Actions
  loadFromDb: () => Promise<void>;
  setOnboardingConfig: (config: Omit<SchoolConfig, 'id'>) => Promise<void>;
  
  // Timetable Operations
  assignTeacherToSlot: (classSection: string, dayIndex: number, periodIndex: number, teacherId: string) => Promise<void>;
  clearSlot: (classSection: string, dayIndex: number, periodIndex: number) => Promise<void>;
  clearAllTimetable: () => Promise<void>;

  // Subject Constraint Actions
  saveSectionRequirements: (classSection: string, allocations: Record<string, number>, enabledSubjects: string[]) => Promise<void>;
  applyPresetToSection: (classSection: string, presetId: string) => Promise<void>;

  // Preset Actions
  savePreset: (preset: Preset) => Promise<void>;
  deletePreset: (presetId: string) => Promise<void>;

  // Teacher Actions
  saveTeacher: (teacher: Teacher) => Promise<void>;
  deleteTeacher: (teacherId: string) => Promise<void>;

  // UI Actions
  setSelectedClassSection: (classSection: string | null) => void;
  setSelectedTeacherId: (teacherId: string | null) => void;
  resetAllData: () => Promise<void>;
}

// Helper to calculate validation, clashes, and loads
function calculateValidation(
  timetable: Record<string, TimetableSlot>,
  teachers: Teacher[]
): ValidationResult {
  const clashes = new Set<string>();
  const teacherLoads: Record<string, number> = {};
  const classSubjectLoads: Record<string, Record<string, number>> = {};

  // Initialize teacher loads
  teachers.forEach(t => {
    teacherLoads[t.id] = 0;
  });

  // Track teacher positions by day and period to find clashes
  // key: "teacherId-dayIndex-periodIndex" -> array of slot IDs
  const teacherSchedule: Record<string, string[]> = {};

  Object.values(timetable).forEach(slot => {
    if (!slot.teacherId) return;

    // Increment teacher workload
    if (teacherLoads[slot.teacherId] !== undefined) {
      teacherLoads[slot.teacherId]++;
    } else {
      teacherLoads[slot.teacherId] = 1;
    }

    // Track teacher slot to identify double booking
    const teacherKey = `${slot.teacherId}-${slot.dayIndex}-${slot.periodIndex}`;
    if (!teacherSchedule[teacherKey]) {
      teacherSchedule[teacherKey] = [];
    }
    teacherSchedule[teacherKey].push(slot.id);

    // Increment class subject allocation counts
    if (!classSubjectLoads[slot.classSection]) {
      classSubjectLoads[slot.classSection] = {};
    }
    if (!classSubjectLoads[slot.classSection][slot.subjectId]) {
      classSubjectLoads[slot.classSection][slot.subjectId] = 0;
    }
    classSubjectLoads[slot.classSection][slot.subjectId]++;
  });

  // Find double-bookings
  Object.values(teacherSchedule).forEach(slotIds => {
    if (slotIds.length > 1) {
      slotIds.forEach(id => clashes.add(id));
    }
  });

  return { clashes, teacherLoads, classSubjectLoads };
}

export const useStore = create<TimetableStore>((set, get) => ({
  schoolConfig: null,
  subjects: [],
  presets: [],
  teachers: [],
  sectionRequirements: [],
  timetable: {},
  selectedClassSection: null,
  selectedTeacherId: null,
  clashingSlots: new Set(),
  teacherLoads: {},
  classSubjectLoads: {},
  isLoading: true,

  loadFromDb: async () => {
    set({ isLoading: true });
    try {
      await initializeDefaults();

      const config = await db.schoolConfig.get('current');
      const subjects = await db.subjects.toArray();
      const presets = await db.presets.toArray();
      const teachers = await db.teachers.toArray();
      const sectionRequirements = await db.sectionRequirements.toArray();
      const rawTimetable = await db.timetable.toArray();

      const timetable: Record<string, TimetableSlot> = {};
      rawTimetable.forEach(slot => {
        timetable[slot.id] = slot;
      });

      const { clashes, teacherLoads, classSubjectLoads } = calculateValidation(timetable, teachers);

      set({
        schoolConfig: config || null,
        subjects,
        presets,
        teachers,
        sectionRequirements,
        timetable,
        clashingSlots: clashes,
        teacherLoads,
        classSubjectLoads,
        isLoading: false
      });

      // Default active selections if none set
      const state = get();
      if (!state.selectedClassSection && config) {
        // Construct first classSection
        // e.g. Class 6 Section A -> "6A"
        // Let's deduce lists
        const gradeList = Array.from({ length: config.classes }, (_, i) => (6 + i).toString());
        const sectionList = Array.from({ length: config.sections }, (_, i) => String.fromCharCode(65 + i));
        if (gradeList.length > 0 && sectionList.length > 0) {
          set({ selectedClassSection: `${gradeList[0]}${sectionList[0]}` });
        }
      }
      if (!state.selectedTeacherId && teachers.length > 0) {
        set({ selectedTeacherId: teachers[0].id });
      }
    } catch (e) {
      console.error('Failed to load database:', e);
      set({ isLoading: false });
    }
  },

  setOnboardingConfig: async (config) => {
    const fullConfig = { id: 'current', ...config };
    await db.schoolConfig.put(fullConfig);

    // Clean timetable when onboarding is re-run
    await db.timetable.clear();
    await db.sectionRequirements.clear();

    set({ schoolConfig: fullConfig, timetable: {}, clashingSlots: new Set(), teacherLoads: {}, classSubjectLoads: {} });
    await get().loadFromDb();
  },

  assignTeacherToSlot: async (classSection, dayIndex, periodIndex, teacherId) => {
    const teacher = get().teachers.find(t => t.id === teacherId);
    if (!teacher) return;
    
    // Auto-detect the subject based on teacher's primary subject
    // We assume the teacher teaches a subject. If they teach multiple, we default to the first one they teach
    // that is requested or available, otherwise we use their first subject
    const subjectId = teacher.subjects[0] || '';

    const slotId = `${classSection}-${dayIndex}-${periodIndex}`;
    const newSlot: TimetableSlot = {
      id: slotId,
      classSection,
      dayIndex,
      periodIndex,
      teacherId,
      subjectId
    };

    await db.timetable.put(newSlot);

    const updatedTimetable = { ...get().timetable, [slotId]: newSlot };
    const { clashes, teacherLoads, classSubjectLoads } = calculateValidation(updatedTimetable, get().teachers);

    set({
      timetable: updatedTimetable,
      clashingSlots: clashes,
      teacherLoads,
      classSubjectLoads
    });
  },

  clearSlot: async (classSection, dayIndex, periodIndex) => {
    const slotId = `${classSection}-${dayIndex}-${periodIndex}`;
    await db.timetable.delete(slotId);

    const updatedTimetable = { ...get().timetable };
    delete updatedTimetable[slotId];

    const { clashes, teacherLoads, classSubjectLoads } = calculateValidation(updatedTimetable, get().teachers);

    set({
      timetable: updatedTimetable,
      clashingSlots: clashes,
      teacherLoads,
      classSubjectLoads
    });
  },

  clearAllTimetable: async () => {
    await db.timetable.clear();
    const { clashes, teacherLoads, classSubjectLoads } = calculateValidation({}, get().teachers);
    set({
      timetable: {},
      clashingSlots: clashes,
      teacherLoads,
      classSubjectLoads
    });
  },

  saveSectionRequirements: async (classSection, allocations, enabledSubjects) => {
    const req: SectionRequirement = {
      classSection,
      allocations,
      enabledSubjects
    };
    await db.sectionRequirements.put(req);

    // Update state cache
    const existing = get().sectionRequirements.filter(r => r.classSection !== classSection);
    set({
      sectionRequirements: [...existing, req]
    });
  },

  applyPresetToSection: async (classSection, presetId) => {
    const preset = get().presets.find(p => p.id === presetId);
    if (!preset) return;

    await get().saveSectionRequirements(classSection, preset.allocations, preset.enabledSubjects);
  },

  savePreset: async (preset) => {
    await db.presets.put(preset);
    const presets = await db.presets.toArray();
    set({ presets });
  },

  deletePreset: async (presetId) => {
    if (presetId === 'default') return; // protect default
    await db.presets.delete(presetId);
    const presets = await db.presets.toArray();
    set({ presets });
  },

  saveTeacher: async (teacher) => {
    await db.teachers.put(teacher);
    const teachers = await db.teachers.toArray();
    const { clashes, teacherLoads, classSubjectLoads } = calculateValidation(get().timetable, teachers);

    set({ teachers, clashingSlots: clashes, teacherLoads, classSubjectLoads });
    if (!get().selectedTeacherId) {
      set({ selectedTeacherId: teacher.id });
    }
  },

  deleteTeacher: async (teacherId) => {
    await db.teachers.delete(teacherId);
    
    // Also delete any timetable slots assigned to this deleted teacher
    const rawTimetable = Object.values(get().timetable);
    for (const slot of rawTimetable) {
      if (slot.teacherId === teacherId) {
        await db.timetable.delete(slot.id);
      }
    }

    const teachers = await db.teachers.toArray();
    
    // Reload database caches
    await get().loadFromDb();

    if (get().selectedTeacherId === teacherId) {
      set({ selectedTeacherId: teachers[0]?.id || null });
    }
  },

  setSelectedClassSection: (selectedClassSection) => set({ selectedClassSection }),
  setSelectedTeacherId: (selectedTeacherId) => set({ selectedTeacherId }),

  resetAllData: async () => {
    await db.timetable.clear();
    await db.teachers.clear();
    await db.sectionRequirements.clear();
    await db.schoolConfig.clear();
    await db.presets.clear();
    await db.subjects.clear();
    
    set({
      schoolConfig: null,
      timetable: {},
      teachers: [],
      sectionRequirements: [],
      presets: [],
      subjects: [],
      selectedClassSection: null,
      selectedTeacherId: null,
      clashingSlots: new Set(),
      teacherLoads: {},
      classSubjectLoads: {}
    });

    await get().loadFromDb();
  }
}));
