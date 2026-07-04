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

  // Auto-fill Actions
  autoSuggestTeacherSlots: (teacherId: string) => TimetableSlot[];
  bulkAssignSlots: (slots: TimetableSlot[]) => Promise<void>;

  // Subject Actions
  addSubject: (name: string) => Promise<{ success: boolean; error?: string }>;
  updateSubject: (id: string, name: string) => Promise<{ success: boolean; error?: string }>;
  deleteSubject: (id: string) => Promise<{ affectedTeachers: string[]; affectedPresets: string[]; affectedSlots: number }>;
  getDeleteSubjectImpact: (id: string) => { affectedTeachers: string[]; affectedPresets: string[]; affectedSlots: number; affectedSections: string[] };

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

  // --- Auto-fill Actions ---

  autoSuggestTeacherSlots: (teacherId) => {
    const state = get();
    const config = state.schoolConfig;
    if (!config) return [];

    const teacher = state.teachers.find(t => t.id === teacherId);
    if (!teacher) return [];

    const currentLoad = state.teacherLoads[teacherId] || 0;
    const remainingLoad = Math.max(0, teacher.maxWorkload - currentLoad);
    if (remainingLoad === 0) return [];

    const allowedClasses = new Set(teacher.classes);
    const primarySubject = teacher.subjects[0];
    if (!primarySubject) return [];

    // Find all valid sections that need this subject and are in allowed classes
    const validSections = state.sectionRequirements.filter(req => {
      const isAllowedClass = allowedClasses.size === 0 || allowedClasses.has(req.classSection);
      return isAllowedClass && req.enabledSubjects.includes(primarySubject);
    });

    const candidateSlots: { classSection: string, dayIndex: number, periodIndex: number }[] = [];
    const teacherSchedule = new Set<string>();
    
    const teacherDailyLoad: Record<number, number> = {};
    const teacherPeriodsByDay: Record<number, Set<number>> = {};
    
    for (let i = 0; i < config.daysPerWeek; i++) {
      teacherDailyLoad[i] = 0;
      teacherPeriodsByDay[i] = new Set();
    }

    Object.values(state.timetable).forEach(slot => {
      if (slot.teacherId === teacherId) {
        teacherSchedule.add(`${slot.dayIndex}-${slot.periodIndex}`);
        teacherDailyLoad[slot.dayIndex]++;
        teacherPeriodsByDay[slot.dayIndex].add(slot.periodIndex);
      }
    });

    const sectionPeriods = new Set<string>();
    Object.values(state.timetable).forEach(slot => {
      if (slot.subjectId === primarySubject) {
        sectionPeriods.add(`${slot.classSection}-${slot.periodIndex}`);
      }
    });

    for (const req of validSections) {
      const currentAllocated = state.classSubjectLoads[req.classSection]?.[primarySubject] || 0;
      const targetAllocated = req.allocations[primarySubject] || 0;
      const remainingSectionLoad = Math.max(0, targetAllocated - currentAllocated);
      
      if (remainingSectionLoad <= 0) continue;

      for (let dayIndex = 0; dayIndex < config.daysPerWeek; dayIndex++) {
        for (let periodIndex = 0; periodIndex < config.periodsPerDay; periodIndex++) {
          const slotId = `${req.classSection}-${dayIndex}-${periodIndex}`;
          if (state.timetable[slotId]) continue; // Slot occupied
          if (teacherSchedule.has(`${dayIndex}-${periodIndex}`)) continue; // Teacher busy

          candidateSlots.push({ classSection: req.classSection, dayIndex, periodIndex });
        }
      }
    }

    const suggestedSlots: TimetableSlot[] = [];
    let loadAssigned = 0;
    
    const localTeacherSchedule = new Set(teacherSchedule);
    const localSectionSubjectLoads: Record<string, number> = {};
    const localTeacherDailyLoad = { ...teacherDailyLoad };
    const localTeacherPeriodsByDay: Record<number, Set<number>> = {};
    
    for (let i = 0; i < config.daysPerWeek; i++) {
      localTeacherPeriodsByDay[i] = new Set(teacherPeriodsByDay[i]);
    }

    while (loadAssigned < remainingLoad) {
      let bestCand = null;
      let bestScore = -Infinity;
      let bestIndex = -1;

      for (let i = 0; i < candidateSlots.length; i++) {
        const cand = candidateSlots[i];
        
        if (localTeacherSchedule.has(`${cand.dayIndex}-${cand.periodIndex}`)) continue;

        const req = validSections.find(r => r.classSection === cand.classSection)!;
        const targetAllocated = req.allocations[primarySubject] || 0;
        const currentAllocated = state.classSubjectLoads[cand.classSection]?.[primarySubject] || 0;
        const locallyAllocated = localSectionSubjectLoads[cand.classSection] || 0;
        if (currentAllocated + locallyAllocated >= targetAllocated) continue;

        let score = 0;
        // 1. Fixed period preference (+100)
        if (sectionPeriods.has(`${cand.classSection}-${cand.periodIndex}`)) {
          score += 100;
        }
        
        // 2. Clustering (+20)
        if (localTeacherPeriodsByDay[cand.dayIndex].has(cand.periodIndex - 1) || 
            localTeacherPeriodsByDay[cand.dayIndex].has(cand.periodIndex + 1)) {
          score += 20;
        }

        // 3. Daily Load Penalty (-10 * N)
        score -= 10 * localTeacherDailyLoad[cand.dayIndex];

        if (score > bestScore) {
          bestScore = score;
          bestCand = cand;
          bestIndex = i;
        }
      }

      if (!bestCand) break;

      localTeacherSchedule.add(`${bestCand.dayIndex}-${bestCand.periodIndex}`);
      localSectionSubjectLoads[bestCand.classSection] = (localSectionSubjectLoads[bestCand.classSection] || 0) + 1;
      localTeacherDailyLoad[bestCand.dayIndex]++;
      localTeacherPeriodsByDay[bestCand.dayIndex].add(bestCand.periodIndex);

      suggestedSlots.push({
        id: `suggested-${bestCand.classSection}-${bestCand.dayIndex}-${bestCand.periodIndex}-${Date.now()}`,
        classSection: bestCand.classSection,
        dayIndex: bestCand.dayIndex,
        periodIndex: bestCand.periodIndex,
        teacherId,
        subjectId: primarySubject
      });

      loadAssigned++;
      candidateSlots.splice(bestIndex, 1);
    }

    return suggestedSlots;
  },

  bulkAssignSlots: async (slots) => {
    const dbSlots = slots.map(slot => ({
      ...slot,
      id: `${slot.classSection}-${slot.dayIndex}-${slot.periodIndex}`
    }));

    await db.timetable.bulkPut(dbSlots);

    const updatedTimetable = { ...get().timetable };
    dbSlots.forEach(slot => {
      updatedTimetable[slot.id] = slot;
    });

    const { clashes, teacherLoads, classSubjectLoads } = calculateValidation(updatedTimetable, get().teachers);

    set({
      timetable: updatedTimetable,
      clashingSlots: clashes,
      teacherLoads,
      classSubjectLoads
    });
  },

  // --- Subject CRUD Actions ---

  addSubject: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return { success: false, error: 'Subject name cannot be empty.' };

    // Generate slug ID from name
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) return { success: false, error: 'Invalid subject name.' };

    // Check uniqueness (case-insensitive name + id)
    const existing = get().subjects;
    if (existing.some(s => s.id === id)) {
      return { success: false, error: `A subject with ID "${id}" already exists.` };
    }
    if (existing.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, error: `A subject named "${trimmed}" already exists.` };
    }

    await db.subjects.add({ id, name: trimmed.toLowerCase() });
    const subjects = await db.subjects.toArray();
    set({ subjects });
    return { success: true };
  },

  updateSubject: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return { success: false, error: 'Subject name cannot be empty.' };

    // Check name uniqueness (excluding self)
    const existing = get().subjects;
    if (existing.some(s => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, error: `A subject named "${trimmed}" already exists.` };
    }

    await db.subjects.update(id, { name: trimmed.toLowerCase() });
    const subjects = await db.subjects.toArray();
    set({ subjects });
    return { success: true };
  },

  getDeleteSubjectImpact: (id) => {
    const state = get();
    const affectedTeachers = state.teachers
      .filter(t => t.subjects.includes(id))
      .map(t => t.fullName);
    const affectedPresets = state.presets
      .filter(p => p.enabledSubjects.includes(id) || id in p.allocations)
      .map(p => p.name);
    const affectedSlots = Object.values(state.timetable)
      .filter(s => s.subjectId === id).length;
    const affectedSections = state.sectionRequirements
      .filter(r => r.enabledSubjects.includes(id) || id in r.allocations)
      .map(r => r.classSection);
    return { affectedTeachers, affectedPresets, affectedSlots, affectedSections };
  },

  deleteSubject: async (id) => {
    const state = get();

    // 1. Cascade: Remove from teachers
    const affectedTeachers: string[] = [];
    for (const teacher of state.teachers) {
      if (teacher.subjects.includes(id)) {
        affectedTeachers.push(teacher.fullName);
        const updated = { ...teacher, subjects: teacher.subjects.filter(s => s !== id) };
        await db.teachers.put(updated);
      }
    }

    // 2. Cascade: Remove from presets
    const affectedPresets: string[] = [];
    for (const preset of state.presets) {
      if (preset.enabledSubjects.includes(id) || id in preset.allocations) {
        affectedPresets.push(preset.name);
        const newAllocations = { ...preset.allocations };
        delete newAllocations[id];
        const updated = {
          ...preset,
          enabledSubjects: preset.enabledSubjects.filter(s => s !== id),
          allocations: newAllocations
        };
        await db.presets.put(updated);
      }
    }

    // 3. Cascade: Remove from section requirements
    for (const req of state.sectionRequirements) {
      if (req.enabledSubjects.includes(id) || id in req.allocations) {
        const newAllocations = { ...req.allocations };
        delete newAllocations[id];
        const updated = {
          ...req,
          enabledSubjects: req.enabledSubjects.filter(s => s !== id),
          allocations: newAllocations
        };
        await db.sectionRequirements.put(updated);
      }
    }

    // 4. Cascade: Clear timetable slots with this subject
    let affectedSlots = 0;
    for (const slot of Object.values(state.timetable)) {
      if (slot.subjectId === id) {
        await db.timetable.delete(slot.id);
        affectedSlots++;
      }
    }

    // 5. Delete the subject itself
    await db.subjects.delete(id);

    // 6. Reload everything and recalculate
    await get().loadFromDb();

    return { affectedTeachers, affectedPresets, affectedSlots };
  },

  // --- Preset Actions ---

  savePreset: async (preset) => {
    await db.presets.put(preset);
    const presets = await db.presets.toArray();
    set({ presets });
  },

  deletePreset: async (presetId) => {
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
