import React, { useState, useMemo } from 'react';
import { StudentInfo, AdminInfo, Year, AttendanceRecord } from '../types';
import { emotionUIConfig } from './uiConfig';
import { exportMonthlySummaryToCSV, exportStudentDetailsReportToCSV } from '../services/csvExportService';
import { MidTermAssessment } from './MidTermAssessment';
import { MarkUpdate } from '../services/apiService';


interface TeacherDashboardProps {
    currentUser: AdminInfo;
    studentDirectory: Map<string, StudentInfo>;
    adminDirectory: Map<string, AdminInfo>;
    attendance: AttendanceRecord[];
    faceLinks: Map<number, string>;
    onLogout: () => void;
    onDownload: (filteredAttendance: AttendanceRecord[]) => void;
    onUpdateMarks: (updates: MarkUpdate[]) => Promise<void>;
}

// Icons for Action Cards
const DailyLogIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4" />
    </svg>
);

const MonthlySummaryIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

const StudentDetailsIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.282-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.124-1.282.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);

const ActionCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
    disabled: boolean;
    colorClass: { bg: string };
}> = ({ icon, title, description, onClick, disabled, colorClass }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`
            bg-slate-900/50 rounded-lg p-4 flex items-center gap-4 w-full text-left border border-slate-700/80 transition-all duration-200
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800/60 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500'}
        `}
    >
        <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${colorClass.bg}`}>
            {icon}
        </div>
        <div className="flex-grow">
            <h3 className="font-bold text-white">{title}</h3>
            <p className="text-sm text-gray-400">{description}</p>
        </div>
        <div className="flex-shrink-0 text-gray-400 group-hover:text-white transition-colors">
            <DownloadIcon className="w-6 h-6" />
        </div>
    </button>
);

const StudentProfileModal: React.FC<{
    student: StudentInfo;
    attendance: AttendanceRecord[];
    faceLinks: Map<number, string>;
    onClose: () => void;
}> = ({ student, attendance, faceLinks, onClose }) => {
    
    const studentPersistentId = useMemo(() => {
        for (const [pid, roll] of faceLinks.entries()) {
            if (roll === student.rollNumber) return pid;
        }
        return null;
    }, [faceLinks, student.rollNumber]);

    const studentAttendance = useMemo(() => {
        if (studentPersistentId === null) return [];
        return attendance
            .filter(record => record.persistentId === studentPersistentId)
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [attendance, studentPersistentId]);

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700 w-full max-w-2xl m-4 flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between pb-4 border-b border-slate-700">
                    <div className="flex items-center gap-4">
                        {student.photoBase64 ? (
                            <img src={student.photoBase64} alt={student.name} className="w-20 h-20 rounded-full object-cover border-2 border-slate-600" />
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-indigo-300 font-bold text-3xl">
                                {student.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h2 className="text-3xl font-bold text-white">{student.name}</h2>
                            <p className="text-lg text-gray-400">{student.rollNumber}</p>
                            <p className="text-md text-indigo-300 mt-1">{student.department} - {student.year} - Sec {student.section}</p>
                        </div>
                    </div>
                     <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full text-gray-400 hover:bg-slate-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <div className="mt-6 flex-grow overflow-y-auto pr-2">
                     <h3 className="text-xl font-bold text-gray-200 mb-3">Attendance Log ({studentAttendance.length})</h3>
                     <div className="bg-slate-900/50 rounded-lg">
                        {studentAttendance.length === 0 ? (
                            <p className="text-center text-gray-500 p-8">No attendance records found for this student.</p>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-slate-900/80 backdrop-blur-sm">
                                    <tr>
                                        <th className="p-3 text-sm font-semibold text-gray-400">Date</th>
                                        <th className="p-3 text-sm font-semibold text-gray-400">Time</th>
                                        <th className="p-3 text-sm font-semibold text-gray-400">Emotion</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {studentAttendance.map(record => {
                                        const date = new Date(record.timestamp);
                                        return (
                                            <tr key={record.timestamp} className="hover:bg-slate-800/60">
                                                <td className="p-3 text-sm text-gray-300">{date.toLocaleDateString()}</td>
                                                <td className="p-3 text-sm text-gray-300">{date.toLocaleTimeString()}</td>
                                                <td className="p-3 text-sm text-gray-300 flex items-center gap-2">
                                                    <span>{emotionUIConfig[record.emotion].emoji}</span>
                                                    <span>{record.emotion}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                     </div>
                </div>

                <footer className="mt-6 pt-4 border-t border-slate-700 text-right">
                    {student.isBlocked && <p className="text-sm font-bold text-red-400 float-left pt-2">This account is currently BLOCKED.</p>}
                     <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2 rounded-md font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export const TeacherDashboard: React.FC<TeacherDashboardProps> = (props) => {
    const { currentUser, studentDirectory, adminDirectory, attendance, faceLinks, onLogout, onDownload, onUpdateMarks } = props;
    
    const [activeTab, setActiveTab] = useState<'attendance' | 'marks'>('attendance');
    const [yearFilter, setYearFilter] = useState<string>('ALL');
    const [sectionFilter, setSectionFilter] = useState<string>('ALL');
    const [selectedStudent, setSelectedStudent] = useState<StudentInfo | null>(null);

    const filteredStudents = useMemo(() => {
        // Teachers can only see students in their own department.
        return Array.from(studentDirectory.values()).filter(student => {
            const departmentMatch = student.department === currentUser.department;
            const yearMatch = yearFilter === 'ALL' || student.year === yearFilter;
            const sectionMatch = sectionFilter === 'ALL' || student.section === sectionFilter;
            return departmentMatch && yearMatch && sectionMatch;
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [studentDirectory, currentUser.department, yearFilter, sectionFilter]);

    const handleDownloadLogClick = () => {
        const filteredRollNumbers = new Set(filteredStudents.map(s => s.rollNumber));
        const persistentIdsForReport = new Set<number>();
        for (const [pid, roll] of faceLinks.entries()) {
            if (filteredRollNumbers.has(roll)) {
                persistentIdsForReport.add(pid);
            }
        }
        const filteredAttendance = attendance.filter(record => persistentIdsForReport.has(record.persistentId));
        onDownload(filteredAttendance);
    };

    const handleDownloadSummaryClick = () => {
        exportMonthlySummaryToCSV(filteredStudents, attendance, faceLinks);
    };

    const handleDownloadDetailsClick = () => {
        exportStudentDetailsReportToCSV(filteredStudents, Array.from(adminDirectory.values()));
    };

    return (
        <div className="w-full max-w-7xl mx-auto flex flex-col animate-fade-in">
             {selectedStudent && (
                <StudentProfileModal
                    student={selectedStudent}
                    attendance={attendance}
                    faceLinks={faceLinks}
                    onClose={() => setSelectedStudent(null)}
                />
            )}
             <header className="mb-6 w-full flex justify-between items-center">
                <div className="flex items-center gap-4">
                    {currentUser.photoBase64 ? (
                        <img src={currentUser.photoBase64} alt={currentUser.name} className="w-14 h-14 rounded-full object-cover border-2 border-slate-600" />
                    ) : (
                         <img src="https://krucet.ac.in/wp-content/uploads/2020/09/cropped-kru-150-round-non-transparent-1.png" alt="Krishna University Logo" className="w-14 h-14 rounded-full" />
                    )}
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-gray-200">Teacher Dashboard</h1>
                        <p className="text-sm text-gray-400">Welcome, {currentUser.name} ({currentUser.department})</p>
                    </div>
                </div>
                <button onClick={onLogout} className="px-4 py-2 rounded-md font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-transform duration-100 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-500 active:translate-y-0.5 shadow-lg">
                    Logout
                </button>
            </header>

            <main className="w-full bg-slate-800/40 rounded-2xl shadow-2xl p-4 md:p-6 border border-slate-800 backdrop-blur-sm">
                <div className="border-b border-slate-700 mb-6">
                    <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('attendance')}
                            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-lg transition-colors ${
                                activeTab === 'attendance'
                                ? 'border-indigo-400 text-indigo-300'
                                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                            }`}
                        >
                            Attendance Management
                        </button>
                        <button
                            onClick={() => setActiveTab('marks')}
                            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-lg transition-colors ${
                                activeTab === 'marks'
                                ? 'border-indigo-400 text-indigo-300'
                                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                            }`}
                        >
                            Mid-Term Assessment
                        </button>
                    </nav>
                </div>

                {activeTab === 'attendance' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 space-y-6">
                            <div>
                                <h2 className="text-2xl font-bold text-indigo-300 mb-4">Actions</h2>
                                <div className="space-y-3">
                                    <ActionCard
                                        icon={<DailyLogIcon className="w-6 h-6 text-cyan-200" />}
                                        title="Daily Log"
                                        description="Download day-by-day attendance."
                                        onClick={handleDownloadLogClick}
                                        disabled={filteredStudents.length === 0}
                                        colorClass={{ bg: 'bg-cyan-500/20' }}
                                    />
                                    <ActionCard
                                        icon={<MonthlySummaryIcon className="w-6 h-6 text-purple-200" />}
                                        title="Monthly Summary"
                                        description="Download monthly percentages."
                                        onClick={handleDownloadSummaryClick}
                                        disabled={filteredStudents.length === 0}
                                        colorClass={{ bg: 'bg-purple-500/20' }}
                                    />
                                    <ActionCard
                                        icon={<StudentDetailsIcon className="w-6 h-6 text-blue-200" />}
                                        title="Student Details"
                                        description="Download student contact info."
                                        onClick={handleDownloadDetailsClick}
                                        disabled={filteredStudents.length === 0}
                                        colorClass={{ bg: 'bg-blue-500/20' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-indigo-300 mb-4">Instructions</h2>
                                <div className="bg-slate-900/50 p-4 rounded-lg text-gray-400 text-sm space-y-2">
                                    <p><span className="font-bold text-gray-300">View Profile:</span> Click on any student row to view their detailed profile and full attendance history.</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="lg:col-span-2">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold text-indigo-300">Students in {currentUser.department} ({filteredStudents.length})</h2>
                                <div className="flex gap-2">
                                    <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 transition">
                                        <option value="ALL">All Years</option>
                                        {Object.values(Year).map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 transition">
                                        <option value="ALL">All Sections</option>
                                        <option value="1">Section 1</option>
                                        <option value="2">Section 2</option>
                                        <option value="3">Section 3</option>
                                        <option value="4">Section 4</option>
                                    </select>
                                </div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg max-h-[60vh] overflow-y-auto">
                                {filteredStudents.length === 0 ? (
                                    <p className="text-center text-gray-500 p-8">No students found matching your filters.</p>
                                ) : (
                                    <div className="divide-y divide-slate-800">
                                    {filteredStudents.map(student => (
                                        <div key={student.rollNumber} onClick={() => setSelectedStudent(student)} className={`p-4 flex justify-between items-center hover:bg-slate-800/60 transition-colors cursor-pointer ${student.isBlocked ? 'opacity-50' : ''}`}>
                                            <div className="flex items-center gap-4">
                                                {student.photoBase64 ? (
                                                    <img src={student.photoBase64} alt={student.name} className="w-12 h-12 rounded-full object-cover border-2 border-slate-600" />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-indigo-300 font-bold text-lg">
                                                        {student.name.charAt(0)}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-bold text-white">{student.name} {student.isBlocked && <span className="text-xs font-bold text-red-400">(Blocked)</span>}</p>
                                                    <p className="text-sm text-gray-400">{student.rollNumber}</p>
                                                    <p className="text-xs text-indigo-300 bg-indigo-900/50 inline-block px-2 py-0.5 rounded mt-1">{student.department} - {student.year} - Sec {student.section}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'marks' && (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <MidTermAssessment 
                                currentUser={currentUser}
                                studentDirectory={studentDirectory}
                                departments={[currentUser.department]}
                                onSaveMarks={onUpdateMarks}
                            />
                        </div>
                         <div className="lg:col-span-1">
                            <h2 className="text-2xl font-bold text-indigo-300 mb-4">Instructions</h2>
                            <div className="bg-slate-900/50 p-4 rounded-lg text-gray-400 text-sm space-y-2">
                                <p>1. <span className="font-bold text-gray-300">Select Criteria:</span> Choose the year, subject, and mid-term exam.</p>
                                <p>2. <span className="font-bold text-gray-300">Load Students:</span> Click the button to display the student list for your department.</p>
                                <p>3. <span className="font-bold text-gray-300">Enter Marks:</span> Input the marks for each student.</p>
                                <p>4. <span className="font-bold text-gray-300">Save Changes:</span> Click 'Save All Marks' to submit.</p>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};