import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, Download, Upload, Trash2, Plus, Save, Printer, RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from './store';
import { ResizableDivider } from './components/ResizableDivider';
import { db, type Teacher } from './db';

type Tab = 'scheduler' | 'presets' | 'teachers' | 'config';

export default function App() {
  const {
    schoolConfig,
    subjects,
    presets,
    teachers,
    sectionRequirements,
    timetable,
    selectedClassSection,
    selectedTeacherId,
    clashingSlots,
    teacherLoads,
    classSubjectLoads,
    isLoading,
    loadFromDb,
    setOnboardingConfig,
    assignTeacherToSlot,
    clearSlot,
    applyPresetToSection,
    savePreset,
    deletePreset,
    saveTeacher,
    deleteTeacher,
    setSelectedClassSection,
    setSelectedTeacherId,
    resetAllData
  } = useStore();


  const [activeTab, setActiveTab] = useState<Tab>('scheduler');

  // Panel widths for dual-view scheduler
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(window.innerWidth / 2);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);

  // Form states
  const [obClasses, setObClasses] = useState<number>(5);
  const [obSections, setObSections] = useState<number>(5);
  const [obPeriods, setObPeriods] = useState<number>(10);
  const [obDays, setObDays] = useState<number>(6);

  // Preset Editor states
  const [selectedPresetId, setSelectedPresetId] = useState<string>('default');
  const [presetName, setPresetName] = useState<string>('Default Preset');
  const [presetAllocations, setPresetAllocations] = useState<Record<string, number>>({});
  const [presetEnabledSubjects, setPresetEnabledSubjects] = useState<string[]>([]);
  const [presetSectionToApply, setPresetSectionToApply] = useState<string>('');

  // Teacher Editor states
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [tShortName, setTShortName] = useState<string>('');
  const [tFullName, setTFullName] = useState<string>('');
  const [tSubjects, setTSubjects] = useState<string[]>([]);
  const [tClasses, setTClasses] = useState<string[]>([]);
  const [tMinLoad, setTMinLoad] = useState<number>(15);
  const [tMaxLoad, setTMaxLoad] = useState<number>(25);

  // Grid Cell Interaction (Active Cell for Popover Selection)
  const [activeCellSlot, setActiveCellSlot] = useState<{ day: number; period: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Developer test states
  const [testTeachersCount, setTestTeachersCount] = useState<number>(10);


  useEffect(() => {
    loadFromDb();
  }, [loadFromDb]);

  // Load Preset Form details when selected preset changes
  useEffect(() => {
    if (presets.length > 0) {
      const selected = presets.find(p => p.id === selectedPresetId) || presets[0];
      if (selected) {
        setPresetName(selected.name);
        setPresetAllocations(selected.allocations || {});
        setPresetEnabledSubjects(selected.enabledSubjects || []);
      }
    }
  }, [selectedPresetId, presets]);

  // Close Cell popover if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setActiveCellSlot(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Class & Section Calculations
  const classGrades = useMemo(() => {
    if (!schoolConfig) return [];
    return Array.from({ length: schoolConfig.classes }, (_, i) => (6 + i).toString());
  }, [schoolConfig]);

  const classSections = useMemo(() => {
    if (!schoolConfig) return [];
    return Array.from({ length: schoolConfig.sections }, (_, i) => String.fromCharCode(65 + i));
  }, [schoolConfig]);

  const allClassSectionsList = useMemo(() => {
    const list: string[] = [];
    classGrades.forEach(g => {
      classSections.forEach(s => {
        list.push(`${g}${s}`);
      });
    });
    return list;
  }, [classGrades, classSections]);

  const daysList = useMemo(() => {
    if (!schoolConfig) return [];
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return names.slice(0, schoolConfig.daysPerWeek);
  }, [schoolConfig]);

  const periodsList = useMemo(() => {
    if (!schoolConfig) return [];
    return Array.from({ length: schoolConfig.periodsPerDay }, (_, i) => `Period ${i + 1}`);
  }, [schoolConfig]);

  // Active Timetable computations for selected class
  const activeClassTimetable = useMemo(() => {
    if (!selectedClassSection) return {};
    const filtered: Record<string, typeof timetable[string]> = {};
    Object.values(timetable).forEach(slot => {
      if (slot.classSection === selectedClassSection) {
        filtered[`${slot.dayIndex}-${slot.periodIndex}`] = slot;
      }
    });
    return filtered;
  }, [timetable, selectedClassSection]);

  // Total Target Slots per Section
  const targetSlotsTotal = useMemo(() => {
    if (!schoolConfig) return 0;
    return schoolConfig.daysPerWeek * schoolConfig.periodsPerDay;
  }, [schoolConfig]);

  // Requirements status for selected Class-Section
  const activeClassRequirements = useMemo(() => {
    if (!selectedClassSection) return null;
    const req = sectionRequirements.find(r => r.classSection === selectedClassSection);
    
    // Default allocations if no custom configuration exists
    const allocations = req ? req.allocations : {};
    const enabled = req ? req.enabledSubjects : [];

    const subjectsStatus = subjects.map(sub => {
      const isEnabled = enabled.includes(sub.id);
      const target = isEnabled ? (allocations[sub.id] || 0) : 0;
      const allocated = (classSubjectLoads[selectedClassSection] || {})[sub.id] || 0;
      return {
        ...sub,
        isEnabled,
        target,
        allocated,
        difference: target - allocated
      };
    });

    const totalAllocated = Object.values(classSubjectLoads[selectedClassSection] || {}).reduce((a, b) => a + b, 0);
    const totalTarget = subjectsStatus.reduce((acc, s) => acc + s.target, 0);

    return {
      subjectsStatus,
      totalAllocated,
      totalTarget,
      isConfigured: !!req
    };
  }, [selectedClassSection, sectionRequirements, subjects, classSubjectLoads]);

  // Active Teacher Requirements status
  const activeTeacherStatus = useMemo(() => {
    if (!selectedTeacherId) return null;
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    if (!teacher) return null;

    const currentLoad = teacherLoads[selectedTeacherId] || 0;
    let status: 'success' | 'warn' | 'error' = 'success';
    let message = 'OK';

    if (currentLoad < teacher.minWorkload) {
      status = 'warn';
      message = `Underloaded (Min: ${teacher.minWorkload})`;
    } else if (currentLoad > teacher.maxWorkload) {
      status = 'error';
      message = `Overloaded (Max: ${teacher.maxWorkload})`;
    }

    return {
      teacher,
      currentLoad,
      status,
      message
    };
  }, [selectedTeacherId, teachers, teacherLoads]);

  // Handle Onboarding Completion
  const handleOnboardingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingConfig({
      classes: obClasses,
      sections: obSections,
      periodsPerDay: obPeriods,
      daysPerWeek: obDays
    });
  };

  // Resize Left Panel Handler
  const handleDividerResize = (clientX: number) => {
    // Ensure panels are bounded
    const minWidth = 300;
    const maxWidth = window.innerWidth - 300;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, clientX));
    setLeftPanelWidth(newWidth);
  };

  // Save Preset Actions
  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const id = selectedPresetId === 'new' ? `preset-${Date.now()}` : selectedPresetId;
    savePreset({
      id,
      name: presetName,
      allocations: presetAllocations,
      enabledSubjects: presetEnabledSubjects
    });
    setSelectedPresetId(id);
    alert('Preset saved successfully.');
  };

  // Create New Preset Action
  const handleCreateNewPreset = () => {
    setSelectedPresetId('new');
    setPresetName('New Preset');
    setPresetAllocations({});
    setPresetEnabledSubjects([]);
  };

  // Apply Preset to selected section
  const handleApplyPresetToSection = () => {
    if (!presetSectionToApply) return;
    applyPresetToSection(presetSectionToApply, selectedPresetId);
    alert(`Applied preset requirements to Section ${presetSectionToApply}.`);
    setPresetSectionToApply('');
  };

  // Preset Allocation Sum
  const presetTotalPeriodsSum = useMemo(() => {
    return presetEnabledSubjects.reduce((acc, subId) => acc + (presetAllocations[subId] || 0), 0);
  }, [presetEnabledSubjects, presetAllocations]);

  // Teacher CRUD Actions
  const handleSaveTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tShortName.trim() || !tFullName.trim() || tSubjects.length === 0) {
      alert('Please fill out all teacher fields and select at least one subject.');
      return;
    }

    const newTeacher: Teacher = {
      id: editingTeacherId || `teacher-${Date.now()}`,
      shortName: tShortName.toUpperCase(),
      fullName: tFullName,
      subjects: tSubjects,
      classes: tClasses,
      minWorkload: tMinLoad,
      maxWorkload: tMaxLoad
    };

    saveTeacher(newTeacher);
    resetTeacherForm();
    alert('Teacher information updated.');
  };

  const resetTeacherForm = () => {
    setEditingTeacherId(null);
    setTShortName('');
    setTFullName('');
    setTSubjects([]);
    setTClasses([]);
    setTMinLoad(15);
    setTMaxLoad(25);
  };

  const handleEditTeacherClick = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setTShortName(teacher.shortName);
    setTFullName(teacher.fullName);
    setTSubjects(teacher.subjects);
    setTClasses(teacher.classes || []);
    setTMinLoad(teacher.minWorkload);
    setTMaxLoad(teacher.maxWorkload);
  };

  // Generate Random Teachers Utility
  const handleGenerateRandomTeachers = () => {
    if (subjects.length === 0) {
      alert('No subjects found in the database. Please initialize defaults first.');
      return;
    }

    const prefixes = ['Mr.', 'Ms.', 'Dr.', 'Mrs.'];
    const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Elizabeth', 'William', 'Linda', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore'];

    const generatedShortNames = new Set<string>(teachers.map(t => t.shortName));

    for (let i = 0; i < testTeachersCount; i++) {
      let shortName = '';
      let attempts = 0;
      do {
        const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
        shortName = `${randLetter()}${randLetter()}${randLetter()}`;
        attempts++;
      } while (generatedShortNames.has(shortName) && attempts < 100);

      if (attempts >= 100) {
        shortName = `T${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
      }

      generatedShortNames.add(shortName);

      const fullName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;

      // Pick 1 to 3 random subjects
      const numSubjects = Math.floor(Math.random() * 3) + 1;
      const shuffSubjects = [...subjects].sort(() => 0.5 - Math.random());
      const selectedSubjects = shuffSubjects.slice(0, numSubjects).map(s => s.id);

      // Pick random classes allowed to teach
      const selectedClasses: string[] = [];
      if (Math.random() > 0.3) {
        allClassSectionsList.forEach(cs => {
          if (Math.random() < 0.25) {
            selectedClasses.push(cs);
          }
        });
      }

      const minWorkload = Math.floor(Math.random() * 7) + 10;
      const maxWorkload = minWorkload + Math.floor(Math.random() * 9) + 6;

      saveTeacher({
        id: `teacher-random-${Date.now()}-${i}`,
        shortName,
        fullName,
        subjects: selectedSubjects,
        classes: selectedClasses,
        minWorkload,
        maxWorkload
      });
    }

    alert(`Successfully generated ${testTeachersCount} random teachers!`);
  };

  // Export JSON Backup
  const handleExportJson = () => {
    const backupData = {
      schoolConfig,
      subjects,
      presets,
      teachers,
      sectionRequirements,
      timetable: Object.values(timetable)
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `school_timetable_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON Backup
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.schoolConfig || !Array.isArray(data.subjects) || !Array.isArray(data.teachers)) {
          alert('Invalid backup file structure.');
          return;
        }

        if (confirm('Importing this file will overwrite all existing timetable data. Do you wish to proceed?')) {
          // Clear current db tables
          await resetAllData();
          
          // Re-populate with backup contents
          await db.schoolConfig.put(data.schoolConfig);
          await db.subjects.clear();
          await db.subjects.bulkAdd(data.subjects);
          
          await db.presets.clear();
          if (Array.isArray(data.presets)) {
            await db.presets.bulkAdd(data.presets);
          }
          
          await db.teachers.clear();
          await db.teachers.bulkAdd(data.teachers);
          
          await db.sectionRequirements.clear();
          if (Array.isArray(data.sectionRequirements)) {
            await db.sectionRequirements.bulkAdd(data.sectionRequirements);
          }
          
          await db.timetable.clear();
          if (Array.isArray(data.timetable)) {
            await db.timetable.bulkAdd(data.timetable);
          }

          await loadFromDb();
          alert('Timetable database successfully restored.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // clear input
  };

  // Export Excel Document
  const handleExportExcel = () => {
    if (!schoolConfig) return;
    const wb = XLSX.utils.book_new();

    // 1. Build sheets for each Class Section
    allClassSectionsList.forEach(classSec => {
      // Prepare 2D Matrix
      const matrix: any[][] = [];
      // Title row
      matrix.push([`Timetable for Class Section: ${classSec}`]);
      // Header row
      const headers = ['Day', ...periodsList];
      matrix.push(headers);

      // Populate rows
      daysList.forEach((day, dIdx) => {
        const row = [day];
        for (let pIdx = 0; pIdx < schoolConfig.periodsPerDay; pIdx++) {
          const slot = timetable[`${classSec}-${dIdx}-${pIdx}`];
          if (slot) {
            const teacher = teachers.find(t => t.id === slot.teacherId);
            const subject = subjects.find(s => s.id === slot.subjectId);
            row.push(`${subject?.name || slot.subjectId} (${teacher?.shortName || slot.teacherId})`);
          } else {
            row.push('-');
          }
        }
        matrix.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(matrix);
      XLSX.utils.book_append_sheet(wb, ws, `Class ${classSec}`);
    });

    // 2. Build sheets for each Teacher
    teachers.forEach(teacher => {
      const matrix: any[][] = [];
      matrix.push([`Timetable for Teacher: ${teacher.fullName} (${teacher.shortName})`]);
      const headers = ['Day', ...periodsList];
      matrix.push(headers);

      daysList.forEach((day, dIdx) => {
        const row = [day];
        for (let pIdx = 0; pIdx < schoolConfig.periodsPerDay; pIdx++) {
          // Find slots assigned to this teacher
          const slots = Object.values(timetable).filter(
            s => s.teacherId === teacher.id && s.dayIndex === dIdx && s.periodIndex === pIdx
          );
          if (slots.length > 0) {
            const classSecs = slots.map(s => s.classSection).join(', ');
            row.push(classSecs);
          } else {
            row.push('-');
          }
        }
        matrix.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(matrix);
      // Sheet name limit is 31 chars
      const sheetName = `${teacher.shortName}`.slice(0, 30);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `School_Timetables_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Eligible teachers selector for selected cell
  const getEligibleTeachersForCell = (day: number, period: number) => {
    if (!selectedClassSection) return [];
    
    // We filter teachers that:
    // 1. Are configured to teach this class section or are allowed to teach all classes
    // 2. Teach the subjects enabled for this class
    const req = sectionRequirements.find(r => r.classSection === selectedClassSection);
    const enabledSubIds = req ? req.enabledSubjects : [];

    return teachers.filter(t => {
      // Verify Class limits
      const isAllowedClass = t.classes.length === 0 || t.classes.includes(selectedClassSection);
      if (!isAllowedClass) return false;

      // Verify subject eligibility
      const teachesEligibleSubject = t.subjects.some(subId => enabledSubIds.includes(subId));
      return teachesEligibleSubject;
    }).map(t => {
      // Identify active double bookings
      const busySlots = Object.values(timetable).filter(
        slot => slot.teacherId === t.id && slot.dayIndex === day && slot.periodIndex === period && slot.classSection !== selectedClassSection
      );
      return {
        ...t,
        isClashing: busySlots.length > 0,
        clashingClass: busySlots[0]?.classSection || null
      };
    });
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="onboarding-container">
        <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--google-text-secondary)' }}>
          Loading timetable schedules...
        </div>
      </div>
    );
  }

  // Onboarding Setup Screen
  if (!schoolConfig) {
    return (
      <div className="onboarding-container">
        <form onSubmit={handleOnboardingSubmit} className="onboarding-card">
          <h2>School Configuration Setup</h2>
          <p style={{ fontSize: '11px', color: 'var(--google-text-secondary)', marginBottom: '12px' }}>
            Configure your school parameters to initialize the timetable builder.
          </p>
          <div className="form-group">
            <label>Number of Classes / Grades (from Class 6 upwards)</label>
            <input 
              type="number" 
              min="1" 
              max="15" 
              value={obClasses} 
              onChange={e => setObClasses(parseInt(e.target.value) || 1)}
              required 
            />
          </div>
          <div className="form-group">
            <label>Number of Sections per Class</label>
            <input 
              type="number" 
              min="1" 
              max="10" 
              value={obSections} 
              onChange={e => setObSections(parseInt(e.target.value) || 1)}
              required 
            />
          </div>
          <div className="form-group">
            <label>Number of Periods per Day</label>
            <input 
              type="number" 
              min="1" 
              max="12" 
              value={obPeriods} 
              onChange={e => setObPeriods(parseInt(e.target.value) || 1)}
              required 
            />
          </div>
          <div className="form-group">
            <label>Number of Working Days per Week</label>
            <select value={obDays} onChange={e => setObDays(parseInt(e.target.value) || 5)}>
              <option value="5">5 Days (Monday - Friday)</option>
              <option value="6">6 Days (Monday - Saturday)</option>
            </select>
          </div>
          <button type="submit" className="primary" style={{ width: '100%', marginTop: '6px', padding: '6px' }}>
            Initialize Timetable Database
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {/* Header bar */}
      <header className="header-bar">
        <div className="header-title">
          <Calendar size={16} />
          <span>Timetable</span>
        </div>

        <nav className="tab-nav">
          <button 
            className={`tab-btn ${activeTab === 'scheduler' ? 'active' : ''}`}
            onClick={() => setActiveTab('scheduler')}
          >
            Scheduler
          </button>
          <button 
            className={`tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            Presets
          </button>
          <button 
            className={`tab-btn ${activeTab === 'teachers' ? 'active' : ''}`}
            onClick={() => setActiveTab('teachers')}
          >
            Teachers
          </button>
          <button 
            className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Config
          </button>
        </nav>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={handleExportExcel} title="Export to Excel">
            <Printer size={13} style={{ marginRight: '4px' }} /> Excel Export
          </button>
          <button onClick={handleExportJson} title="Export JSON Database Backup">
            <Download size={13} style={{ marginRight: '4px' }} /> Backup DB
          </button>
          <button onClick={() => fileInputRef.current?.click()} title="Import JSON Database Backup">
            <Upload size={13} style={{ marginRight: '4px' }} /> Restore DB
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportJson} 
            accept=".json" 
            style={{ display: 'none' }} 
          />
        </div>
      </header>

      {/* Main Panel Content */}
      <main className="main-content">
        
        {/* TAB 1: SCHEDULER VIEW */}
        {activeTab === 'scheduler' && (
          <div className="scheduler-workspace">
            {/* Left Panel: Class View */}
            <div 
              className="scheduler-panel" 
              style={{ width: `${leftPanelWidth}px` }}
            >
              <div className="panel-header">
                <div className="panel-title-row">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 500 }}>Class Section Timetable</h3>
                    <select 
                      value={selectedClassSection || ''} 
                      onChange={e => setSelectedClassSection(e.target.value)}
                      style={{ padding: '2px 4px' }}
                    >
                      {allClassSectionsList.map(cs => (
                        <option key={cs} value={cs}>Class {cs}</option>
                      ))}
                    </select>
                  </div>

                  <button 
                    onClick={() => {
                      if (confirm(`Are you sure you want to clear the timetable for Section ${selectedClassSection}?`)) {
                        allClassSectionsList.forEach(cs => {
                          if (cs === selectedClassSection) {
                            for (let d = 0; d < schoolConfig.daysPerWeek; d++) {
                              for (let p = 0; p < schoolConfig.periodsPerDay; p++) {
                                clearSlot(cs, d, p);
                              }
                            }
                          }
                        });
                      }
                    }}
                    style={{ padding: '2px 6px', color: 'var(--google-red-error)' }}
                    title="Clear current class timetable"
                  >
                    Clear Slots
                  </button>
                </div>

                {/* Constraint status indicator */}
                {activeClassRequirements && (
                  <div style={{ 
                    border: '1px solid var(--google-gray-border)', 
                    borderRadius: '4px', 
                    padding: '4px 8px', 
                    backgroundColor: 'var(--google-gray-bg)',
                    fontSize: '11px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 500 }}>Subject Requirements:</span>
                      <span className={`status-pill ${activeClassRequirements.totalAllocated === activeClassRequirements.totalTarget ? 'success' : 'warn'}`}>
                        Allocated: {activeClassRequirements.totalAllocated} / {activeClassRequirements.totalTarget} periods
                      </span>
                    </div>
                    
                    {/* Compact list of subjects & details */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {activeClassRequirements.subjectsStatus.filter(s => s.isEnabled).map(s => (
                        <span 
                          key={s.id} 
                          style={{ 
                            padding: '1px 4px', 
                            borderRadius: '3px',
                            border: '1px solid var(--google-gray-border)',
                            backgroundColor: s.difference === 0 ? 'var(--google-green-bg)' : (s.difference < 0 ? 'var(--google-red-bg)' : 'var(--google-gray-card)'),
                            color: s.difference === 0 ? 'var(--google-green-success)' : (s.difference < 0 ? 'var(--google-red-error)' : 'var(--google-text-secondary)'),
                            fontSize: '9px'
                          }}
                        >
                          {s.name}: {s.allocated}/{s.target}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Grid table */}
              <div className="panel-grid-container">
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>Day</th>
                        {periodsList.map((p, idx) => (
                          <th key={idx}>{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daysList.map((day, dIdx) => (
                        <tr key={dIdx}>
                          <td style={{ fontWeight: 500, backgroundColor: 'var(--google-gray-bg)' }}>{day}</td>
                          {periodsList.map((_, pIdx) => {
                            const slot = activeClassTimetable[`${dIdx}-${pIdx}`];
                            const isClashing = slot && clashingSlots.has(slot.id);
                            const teacher = slot ? teachers.find(t => t.id === slot.teacherId) : null;
                            const subject = slot ? subjects.find(s => s.id === slot.subjectId) : null;

                            return (
                              <td 
                                key={pIdx} 
                                className={`timetable-cell ${isClashing ? 'clashing' : ''}`}
                                onClick={() => setActiveCellSlot({ day: dIdx, period: pIdx })}
                              >
                                {slot ? (
                                  <div className="timetable-cell-content">
                                    <span className="cell-teacher">{teacher?.shortName || slot.teacherId}</span>
                                    <span className="cell-subject">{subject?.name || slot.subjectId}</span>
                                  </div>
                                ) : (
                                  <div className="timetable-cell-content" style={{ color: '#ccc' }}>+</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Splitter */}
            <ResizableDivider 
              onResize={handleDividerResize}
              isDragging={isDraggingSplitter}
              setIsDragging={setIsDraggingSplitter}
            />

            {/* Right Panel: Teacher View */}
            <div className="scheduler-panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <div className="panel-title-row">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 500 }}>Teacher Timetable Visualizer</h3>
                    <select 
                      value={selectedTeacherId || ''} 
                      onChange={e => setSelectedTeacherId(e.target.value)}
                      style={{ padding: '2px 4px' }}
                    >
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.fullName} ({t.shortName})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Teacher Workload info */}
                {activeTeacherStatus && (
                  <div style={{ 
                    border: '1px solid var(--google-gray-border)', 
                    borderRadius: '4px', 
                    padding: '4px 8px', 
                    backgroundColor: 'var(--google-gray-bg)',
                    fontSize: '11px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Teacher: <strong>{activeTeacherStatus.teacher.fullName}</strong></span>
                      <span className={`status-pill ${activeTeacherStatus.status}`}>
                        Load: {activeTeacherStatus.currentLoad} periods (Min: {activeTeacherStatus.teacher.minWorkload}, Max: {activeTeacherStatus.teacher.maxWorkload})
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid table */}
              <div className="panel-grid-container">
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>Day</th>
                        {periodsList.map((p, idx) => (
                          <th key={idx}>{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daysList.map((day, dIdx) => (
                        <tr key={dIdx}>
                          <td style={{ fontWeight: 500, backgroundColor: 'var(--google-gray-bg)' }}>{day}</td>
                          {periodsList.map((_, pIdx) => {
                            // Find active classes assigned to this teacher
                            const assignedSlots = Object.values(timetable).filter(
                              s => s.teacherId === selectedTeacherId && s.dayIndex === dIdx && s.periodIndex === pIdx
                            );

                            return (
                              <td key={pIdx} className="timetable-cell" style={{ cursor: 'default' }}>
                                <div className="timetable-cell-content">
                                  {assignedSlots.length > 0 ? (
                                    assignedSlots.map(s => (
                                      <span key={s.id} className="cell-class">Class {s.classSection}</span>
                                    ))
                                  ) : (
                                    <span style={{ color: '#ccc' }}>-</span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRESET EDITOR */}
        {activeTab === 'presets' && (
          <div className="config-container">
            <div className="settings-grid-layout">
              {/* Presets List */}
              <div className="settings-list-pane">
                <div style={{ padding: '8px', borderBottom: '1px solid var(--google-gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>Saved Presets</span>
                  <button onClick={handleCreateNewPreset}><Plus size={11} /> New</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {presets.map(p => (
                    <div 
                      key={p.id} 
                      className={`preset-item ${selectedPresetId === p.id ? 'active' : ''}`}
                      style={{ 
                        backgroundColor: selectedPresetId === p.id ? 'var(--google-blue-light)' : 'transparent',
                        padding: '6px 8px',
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedPresetId(p.id)}
                    >
                      <span style={{ fontSize: '12px' }}>{p.name}</span>
                      {p.id !== 'default' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this preset?')) deletePreset(p.id);
                          }}
                          style={{ padding: '1px 3px', border: 'none', background: 'none', color: 'var(--google-red-error)' }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preset Configurations */}
              <div className="settings-form-pane">
                <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px', color: 'var(--google-blue)' }}>
                  {selectedPresetId === 'new' ? 'Create Preset' : 'Edit Preset'}
                </h3>
                
                <div className="form-group" style={{ maxWidth: '300px' }}>
                  <label>Preset Name</label>
                  <input 
                    type="text" 
                    value={presetName} 
                    onChange={e => setPresetName(e.target.value)} 
                    disabled={selectedPresetId === 'default'}
                  />
                </div>

                {/* Requirements check configuration table */}
                <div className="table-container" style={{ margin: '12px 0', maxWidth: '600px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>Use</th>
                        <th>Subject</th>
                        <th style={{ width: '100px' }}>Periods / Week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map(sub => {
                        const isChecked = presetEnabledSubjects.includes(sub.id);
                        const count = presetAllocations[sub.id] || 0;
                        return (
                          <tr key={sub.id}>
                            <td>
                              <input 
                                type="checkbox" 
                                checked={isChecked} 
                                disabled={selectedPresetId === 'default'}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPresetEnabledSubjects([...presetEnabledSubjects, sub.id]);
                                  } else {
                                    setPresetEnabledSubjects(presetEnabledSubjects.filter(id => id !== sub.id));
                                  }
                                }} 
                              />
                            </td>
                            <td>{sub.name}</td>
                            <td>
                              <input 
                                type="number" 
                                min="0" 
                                max={targetSlotsTotal} 
                                value={count} 
                                disabled={!isChecked || selectedPresetId === 'default'}
                                style={{ width: '60px', padding: '2px' }}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setPresetAllocations({
                                    ...presetAllocations,
                                    [sub.id]: val
                                  });
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Preset period verification status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                  <span className={`status-pill ${presetTotalPeriodsSum === targetSlotsTotal ? 'success' : 'warn'}`}>
                    Total Preset Periods: {presetTotalPeriodsSum} / {targetSlotsTotal}
                  </span>
                  
                  {selectedPresetId !== 'default' && (
                    <button className="primary" onClick={handleSavePreset}>
                      <Save size={12} style={{ marginRight: '4px' }} /> Save Preset
                    </button>
                  )}
                </div>

                {/* Apply Preset tools */}
                <div style={{ 
                  borderTop: '1px solid var(--google-gray-border)', 
                  marginTop: '15px', 
                  paddingTop: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>Apply this preset to:</span>
                  <select 
                    value={presetSectionToApply} 
                    onChange={e => setPresetSectionToApply(e.target.value)}
                    style={{ padding: '2px 4px' }}
                  >
                    <option value="">-- Choose Class Section --</option>
                    {allClassSectionsList.map(cs => (
                      <option key={cs} value={cs}>Class {cs}</option>
                    ))}
                  </select>
                  <button onClick={handleApplyPresetToSection} disabled={!presetSectionToApply}>
                    Apply Presets
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TEACHER MANAGEMENT */}
        {activeTab === 'teachers' && (
          <div className="config-container">
            <div className="settings-grid-layout">
              {/* Teacher list */}
              <div className="settings-list-pane">
                <div style={{ padding: '8px', borderBottom: '1px solid var(--google-gray-border)', fontWeight: 500 }}>
                  Teachers Directory
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {subjects.map(sub => {
                    const subTeachers = teachers.filter(t => t.subjects.includes(sub.id));
                    if (subTeachers.length === 0) return null;
                    return (
                      <div key={sub.id}>
                        <div style={{ 
                          backgroundColor: 'var(--google-gray-card)', 
                          padding: '3px 8px', 
                          fontSize: '11px', 
                          fontWeight: 600, 
                          color: 'var(--google-blue)',
                          marginTop: '4px'
                        }}>
                          {sub.name.toLowerCase()}
                        </div>
                        {subTeachers.map(t => (
                          <div 
                            key={`${sub.id}-${t.id}`}
                            className={`teacher-directory-item ${editingTeacherId === t.id ? 'active' : ''}`}
                            style={{ 
                              backgroundColor: editingTeacherId === t.id ? 'var(--google-blue-light)' : 'transparent',
                              padding: '4px 8px',
                              cursor: 'pointer'
                            }}
                            onClick={() => handleEditTeacherClick(t)}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '11px', fontWeight: 500 }}>{t.fullName} ({t.shortName})</span>
                              <span style={{ fontSize: '9px', color: 'var(--google-text-secondary)' }}>
                                Classes: {t.classes && t.classes.length > 0 ? t.classes.join(', ') : 'all'} | Load: {t.minWorkload}-{t.maxWorkload}
                              </span>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete teacher ${t.fullName} and clear all their classes?`)) {
                                  deleteTeacher(t.id);
                                }
                              }}
                              style={{ padding: '1px 3px', border: 'none', background: 'none', color: 'var(--google-red-error)' }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {(() => {
                    const noSubTeachers = teachers.filter(t => t.subjects.length === 0);
                    if (noSubTeachers.length === 0) return null;
                    return (
                      <div>
                        <div style={{ 
                          backgroundColor: 'var(--google-gray-card)', 
                          padding: '3px 8px', 
                          fontSize: '11px', 
                          fontWeight: 600, 
                          color: 'var(--google-blue)',
                          marginTop: '4px'
                        }}>
                          unassigned
                        </div>
                        {noSubTeachers.map(t => (
                          <div 
                            key={`unassigned-${t.id}`}
                            className={`teacher-directory-item ${editingTeacherId === t.id ? 'active' : ''}`}
                            style={{ 
                              backgroundColor: editingTeacherId === t.id ? 'var(--google-blue-light)' : 'transparent',
                              padding: '4px 8px',
                              cursor: 'pointer'
                            }}
                            onClick={() => handleEditTeacherClick(t)}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '11px', fontWeight: 500 }}>{t.fullName} ({t.shortName})</span>
                              <span style={{ fontSize: '9px', color: 'var(--google-text-secondary)' }}>
                                Classes: {t.classes && t.classes.length > 0 ? t.classes.join(', ') : 'all'} | Load: {t.minWorkload}-{t.maxWorkload}
                              </span>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete teacher ${t.fullName}?`)) {
                                  deleteTeacher(t.id);
                                }
                              }}
                              style={{ padding: '1px 3px', border: 'none', background: 'none', color: 'var(--google-red-error)' }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Edit / Add Teacher Form */}
              <form onSubmit={handleSaveTeacher} className="settings-form-pane">
                <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px', color: 'var(--google-blue)' }}>
                  {editingTeacherId ? 'Modify Teacher' : 'Add New Teacher'}
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '500px' }}>
                  <div className="form-group">
                    <label>Short Name (Table display)</label>
                    <input 
                      type="text" 
                      maxLength={5} 
                      placeholder="e.g. MRA" 
                      value={tShortName} 
                      onChange={e => setTShortName(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Mr. Robert" 
                      value={tFullName} 
                      onChange={e => setTFullName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '500px', margin: '8px 0' }}>
                  <div className="form-group">
                    <label>Minimum Weekly Load (Periods)</label>
                    <input 
                      type="number" 
                      min="0" 
                      max="100" 
                      value={tMinLoad} 
                      onChange={e => setTMinLoad(parseInt(e.target.value) || 0)} 
                    />
                  </div>
                  <div className="form-group">
                    <label>Maximum Weekly Load (Periods)</label>
                    <input 
                      type="number" 
                      min="0" 
                      max="100" 
                      value={tMaxLoad} 
                      onChange={e => setTMaxLoad(parseInt(e.target.value) || 0)} 
                    />
                  </div>
                </div>

                {/* Subjs allowed checks */}
                <div style={{ margin: '10px 0' }}>
                  <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--google-text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Subjects Taught (At least select one)
                  </label>
                  <div style={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto', 
                    border: '1px solid var(--google-gray-border)', 
                    borderRadius: '4px',
                    padding: '6px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '4px'
                  }}>
                    {subjects.map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={tSubjects.includes(s.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setTSubjects([...tSubjects, s.id]);
                            } else {
                              setTSubjects(tSubjects.filter(id => id !== s.id));
                            }
                          }}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Class Restriction constraints checks */}
                <div style={{ margin: '10px 0' }}>
                  <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--google-text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Classes Allowed to Teach (Leave empty to allow all)
                  </label>
                  <div style={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto', 
                    border: '1px solid var(--google-gray-border)', 
                    borderRadius: '4px',
                    padding: '6px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                    gap: '4px'
                  }}>
                    {allClassSectionsList.map(cs => (
                      <label key={cs} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={tClasses.includes(cs)}
                          onChange={e => {
                            if (e.target.checked) {
                              setTClasses([...tClasses, cs]);
                            } else {
                              setTClasses(tClasses.filter(c => c !== cs));
                            }
                          }}
                        />
                        {cs}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="submit" className="primary">
                    <Save size={12} style={{ marginRight: '4px' }} /> Save Teacher Info
                  </button>
                  {editingTeacherId && (
                    <button type="button" onClick={resetTeacherForm}>Cancel</button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: GENERAL CONFIG TAB */}
        {activeTab === 'config' && (
          <div className="config-container" style={{ maxWidth: '500px' }}>
            <div style={{ border: '1px solid var(--google-gray-border)', borderRadius: '6px', padding: '12px', backgroundColor: 'var(--google-gray-card)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px', color: 'var(--google-blue)' }}>
                School Settings & Constraints
              </h3>

              <div className="form-group">
                <label>Number of Classes (Grades)</label>
                <input 
                  type="number" 
                  value={obClasses} 
                  onChange={e => setObClasses(parseInt(e.target.value) || 1)} 
                />
              </div>
              <div className="form-group">
                <label>Number of Sections per Class</label>
                <input 
                  type="number" 
                  value={obSections} 
                  onChange={e => setObSections(parseInt(e.target.value) || 1)} 
                />
              </div>
              <div className="form-group">
                <label>Number of Periods per Day</label>
                <input 
                  type="number" 
                  value={obPeriods} 
                  onChange={e => setObPeriods(parseInt(e.target.value) || 1)} 
                />
              </div>
              <div className="form-group">
                <label>Working Days per Week</label>
                <select value={obDays} onChange={e => setObDays(parseInt(e.target.value) || 5)}>
                  <option value="5">5 Days (Monday - Friday)</option>
                  <option value="6">6 Days (Monday - Saturday)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
                <button 
                  onClick={() => {
                    if (confirm('WARNING: Modifying these settings will erase all current weekly scheduler entries. Do you wish to proceed?')) {
                      setOnboardingConfig({
                        classes: obClasses,
                        sections: obSections,
                        periodsPerDay: obPeriods,
                        daysPerWeek: obDays
                      });
                      alert('School Configuration re-saved.');
                    }
                  }}
                  className="primary"
                >
                  Apply Configuration
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid var(--google-gray-border)', borderRadius: '6px', padding: '12px', backgroundColor: 'var(--google-gray-card)', marginTop: '12px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px', color: 'var(--google-blue)' }}>
                Developer Test Tools
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--google-text-secondary)', marginBottom: '10px' }}>
                Generate mock teachers loaded with random subjects, workloads, and section constraints for diagnostic testing.
              </p>
              <div className="form-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Number of Teachers:</label>
                <input 
                  type="number" 
                  min="1" 
                  max="100" 
                  value={testTeachersCount} 
                  onChange={e => setTestTeachersCount(parseInt(e.target.value) || 1)} 
                  style={{ width: '60px' }}
                />
                <button 
                  type="button"
                  onClick={handleGenerateRandomTeachers}
                  className="primary"
                >
                  Generate Dummy Data
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid var(--google-gray-border)', borderRadius: '6px', padding: '12px', backgroundColor: 'var(--google-gray-card)', marginTop: '12px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px', color: 'var(--google-red-error)' }}>
                Dangerous Zone
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--google-text-secondary)', marginBottom: '10px' }}>
                Reset all application settings, teachers list, default subject constraints, and drafts.
              </p>
              <button 
                onClick={async () => {
                  if (confirm('Are you absolutely sure you want to reset everything back to clean defaults? This cannot be undone.')) {
                    await resetAllData();
                    alert('System successfully reset.');
                  }
                }}
                style={{ backgroundColor: 'var(--google-red-bg)', color: 'var(--google-red-error)', borderColor: 'var(--google-red-error)' }}
              >
                <RotateCcw size={12} style={{ marginRight: '4px' }} /> Clear & Reset All Databases
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Grid Cell Selection Menu Popover (floating near click slot) */}
      {activeCellSlot && (
        <div className="dialog-overlay">
          <div ref={popoverRef} className="dialog-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>
                Assign Teacher ({daysList[activeCellSlot.day]}, Period {activeCellSlot.period + 1})
              </span>
              <button 
                onClick={() => {
                  clearSlot(selectedClassSection!, activeCellSlot.day, activeCellSlot.period);
                  setActiveCellSlot(null);
                }}
                style={{ padding: '2px 6px', color: 'var(--google-red-error)', border: 'none', background: 'none' }}
              >
                Clear Slot
              </button>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--google-gray-border)', borderRadius: '4px' }}>
              {getEligibleTeachersForCell(activeCellSlot.day, activeCellSlot.period).length > 0 ? (
                getEligibleTeachersForCell(activeCellSlot.day, activeCellSlot.period).map(t => (
                  <div 
                    key={t.id} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '6px 8px', 
                      borderBottom: '1px solid var(--google-gray-border)',
                      cursor: t.isClashing ? 'not-allowed' : 'pointer',
                      opacity: t.isClashing ? 0.6 : 1,
                      backgroundColor: 'transparent'
                    }}
                    onClick={() => {
                      if (t.isClashing) {
                        alert(`Teacher ${t.fullName} is already assigned to Class ${t.clashingClass} in this slot!`);
                        return;
                      }
                      assignTeacherToSlot(
                        selectedClassSection!, 
                        activeCellSlot.day, 
                        activeCellSlot.period, 
                        t.id
                      );
                      setActiveCellSlot(null);
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '12px' }}>{t.fullName} ({t.shortName})</strong>
                      <div style={{ fontSize: '9px', color: 'var(--google-text-secondary)' }}>
                        Expertise: {t.subjects.map(sId => subjects.find(s => s.id === sId)?.name).join(', ')}
                      </div>
                    </div>
                    {t.isClashing && (
                      <span className="status-pill error" style={{ fontSize: '9px' }}>
                        Clash ({t.clashingClass})
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ padding: '8px', fontSize: '11px', color: 'var(--google-text-secondary)', textAlign: 'center' }}>
                  No eligible teachers found for this section. Configure teachers to teach subjects required by Class {selectedClassSection}.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setActiveCellSlot(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
