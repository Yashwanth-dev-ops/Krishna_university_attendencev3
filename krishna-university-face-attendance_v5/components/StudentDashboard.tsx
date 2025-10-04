import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StudentInfo, AdminInfo, AttendanceRecord, Emotion, MidTermMarks, TimeTableEntry, Conversation, Holiday, StudyGroup, SharedNote } from '../types';
import { emotionUIConfig } from './uiConfig';
import { detectSingleFaceEmotion } from '../services/geminiService';
import { AttendanceStatusPanel } from './AttendanceStatusPanel';
import { AttendanceCaptureModal } from './AttendanceCaptureModal';
import { AttendanceCalendar } from './AttendanceCalendar';
import { DonutChart } from './DonutChart';
import { EditProfileModal } from './EditProfileModal';
import { AIAcademicAdvisorPanel } from './AIAcademicAdvisorPanel';
import { TeacherAvailabilityPanel } from './TeacherAvailabilityPanel';
import { CommunicationPanel } from './CommunicationPanel';
import { AITutorModal } from './AITutorModal';
import { SparklesIcon } from './SparklesIcon';
import { MyMarksPanel } from './MyMarksPanel';
import { CommunityPanel } from './CommunityPanel';

interface StudentDashboardProps {
    currentUser: StudentInfo;
    attendance: AttendanceRecord[];
    faceLinks: Map<number, string>;
    studentDirectory: Map<string, StudentInfo>;
    adminDirectory: Map<string, AdminInfo>;
    timeTable: TimeTableEntry[];
    conversations: Conversation[];
    holidays: Holiday[];
    studyGroups: StudyGroup[];
    sharedNotes: SharedNote[];
    onSendMessage: (receiverId: string, content: string, isPriority?: boolean) => Promise<void>;
    onLogout: () => void;
    onLogAttendance: (persistentId: number, emotion: Emotion, subject?: string) => void;
    onLinkFace: () => Promise<void>;
    onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
    onNavigateToSettings: () => void;
    onCreateStudyGroup: (groupData: Omit<StudyGroup, 'id' | 'events' | 'messages'>) => Promise<void>;
    onJoinStudyGroup: (groupId: string) => Promise<void>;
    onSendGroupMessage: (groupId: string, content: string, file?: { name: string; url: string }, isPriority?: boolean) => Promise<void>;
    onUploadNote: (noteData: Omit<SharedNote, 'id' | 'ratings' | 'createdAt'>) => Promise<void>;
    onRateNote: (noteId: string, rating: number) => Promise<void>;
    onSuggestStudyTime: (groupId: string) => Promise<{ dayOfWeek: number, startTime: string, reason: string }[]>;
    onSummarizeNote: (noteId: string) => Promise<string>;
}

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'BLOCKED' | 'UNLINKED';
type NextClassInfo = { entry: TimeTableEntry; timeToClass: number };
type AppNotification = { id: string; title: string; message: string; };

// --- Icon Components ---
const ClockIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const BookOpenIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
const CalendarIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const CameraIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const XIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;


const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--x', `${x}px`);
    e.currentTarget.style.setProperty('--y', `${y}px`);
};

const formatCountdown = (ms: number): string => {
    if (ms <= 0) return "Now";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
};

// --- Helper function to find the next class ---
const findNextClass = (student: StudentInfo, timeTable: TimeTableEntry[], holidays: Holiday[]): NextClassInfo | null => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Check if today is a holiday
    const isHoliday = holidays.some(h => {
        const start = new Date(h.startDate + 'T00:00:00');
        const end = new Date(h.endDate + 'T23:59:59');
        return now >= start && now <= end;
    });
    if (isHoliday) return null;

    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const currentTimeMs = now.getTime();

    const upcomingClasses = timeTable
        .filter(entry => 
            entry.department === student.department &&
            entry.year === student.year &&
            entry.section === student.section &&
            entry.dayOfWeek === dayOfWeek &&
            !entry.isCancelled && !entry.isAbsent
        )
        .map(entry => {
            const [hours, minutes] = entry.startTime.split(':').map(Number);
            const classTime = new Date();
            classTime.setHours(hours, minutes, 0, 0);
            return { entry, timeToClass: classTime.getTime() - currentTimeMs };
        })
        .filter(item => item.timeToClass >= -60 * 60 * 1000) // Include classes that started up to an hour ago
        .sort((a, b) => a.timeToClass - b.timeToClass);

    return upcomingClasses[0] || null;
};

// --- New Widget Components ---
const UpNextWidget: React.FC<{ nextClassInfo: NextClassInfo | null; adminDirectory: Map<string, AdminInfo> }> = ({ nextClassInfo, adminDirectory }) => {
    const [countdown, setCountdown] = useState('');

    useEffect(() => {
        if (!nextClassInfo) return;

        const intervalId = setInterval(() => {
            const [hours, minutes] = nextClassInfo.entry.startTime.split(':').map(Number);
            const classTime = new Date();
            classTime.setHours(hours, minutes, 0, 0);
            const timeToClass = classTime.getTime() - Date.now();
            setCountdown(formatCountdown(timeToClass));
        }, 1000);

        return () => clearInterval(intervalId);
    }, [nextClassInfo]);

    if (!nextClassInfo) {
        return (
            <div className="bg-white dark:bg-gray-800/50 p-6 rounded-xl border border-gray-200 dark:border-gray-700 h-full flex flex-col items-center justify-center text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-4">All classes for today are done!</h3>
            </div>
        );
    }
    
    const { entry, timeToClass } = nextClassInfo;
    const teacher = adminDirectory.get(entry.teacherId);
    const isLive = timeToClass <= 0;

    return (
        <div className={`p-6 rounded-2xl border-2 transition-all duration-500 ${isLive ? 'bg-blue-900/40 border-blue-500 shadow-lg animate-pulse-slow' : 'bg-gray-800/50 border-gray-700'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-semibold text-blue-300">UP NEXT</p>
                    <p className="text-2xl font-bold text-white mt-1">{entry.subject}</p>
                    <p className="text-sm text-gray-400">by {teacher?.name || 'Unknown Teacher'}</p>
                </div>
                <div className={`text-right ${isLive ? 'text-green-400' : 'text-yellow-400'}`}>
                    <p className="text-sm font-semibold">{isLive ? 'LIVE' : 'STARTS IN'}</p>
                    <p className="text-3xl font-mono font-bold">{countdown}</p>
                </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-300 mt-4 pt-4 border-t border-gray-700/50">
                <div className="flex items-center gap-2"><ClockIcon className="w-4 h-4" /><span>{entry.startTime} - {entry.endTime}</span></div>
                <div className="flex items-center gap-2"><BookOpenIcon className="w-4 h-4" /><span>{entry.department} / {entry.year} / Sec {entry.section}</span></div>
            </div>
        </div>
    );
};

const QuickActionWidget: React.FC<{ title: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }> = ({ title, icon, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 text-left w-full h-full flex flex-col justify-between hover:bg-gray-700/50 hover:border-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
        <div className="text-blue-400">{icon}</div>
        <span className="font-bold text-white mt-2">{title}</span>
    </button>
);

const AttendanceSnapshotWidget: React.FC<{ attendance: AttendanceRecord[]; persistentId: number | null }> = ({ attendance, persistentId }) => {
    const percentage = useMemo(() => {
        if (!persistentId) return 0;
        const studentAttendance = attendance.filter(rec => rec.persistentId === persistentId);
        if (studentAttendance.length === 0) return 100; // Assume 100 if no records yet
        
        const presentDays = new Set(studentAttendance.map(rec => new Date(rec.timestamp).toDateString()));
        const firstDay = new Date(Math.min(...studentAttendance.map(r => r.timestamp)));
        const today = new Date();
        const totalDays = Math.ceil((today.getTime() - firstDay.getTime()) / (1000 * 3600 * 24));
        
        return totalDays > 0 ? (presentDays.size / totalDays) * 100 : 100;
    }, [attendance, persistentId]);

    return (
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex items-center gap-4 h-full">
            <DonutChart percentage={percentage} size={80} strokeWidth={8} />
            <div>
                <p className="text-sm text-gray-400">Overall</p>
                <p className="text-xl font-bold text-white">Attendance</p>
            </div>
        </div>
    );
};

const NotificationBanner: React.FC<{ notification: AppNotification; onDismiss: () => void }> = ({ notification, onDismiss }) => (
    <div className="w-full bg-blue-900/60 border border-blue-500/50 rounded-xl p-4 flex items-start gap-4 animate-fade-in mb-6 shadow-lg backdrop-blur-sm">
        <div className="text-blue-300 mt-1"><ClockIcon className="w-6 h-6" /></div>
        <div className="flex-grow">
            <h4 className="font-bold text-white">{notification.title}</h4>
            <p className="text-sm text-blue-200">{notification.message}</p>
        </div>
        <button onClick={onDismiss} className="p-1 rounded-full hover:bg-blue-700/50"><XIcon className="w-5 h-5" /></button>
    </div>
);


export const StudentDashboard: React.FC<StudentDashboardProps> = (props) => {
    const { 
        currentUser, attendance, faceLinks, adminDirectory, timeTable, conversations, holidays,
        onSendMessage, onLogout, onLogAttendance, onLinkFace, onNavigateToSettings
    } = props;
    const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
    const [captureMode, setCaptureMode] = useState<'MARK' | 'LINK'>('MARK');
    const [activeTab, setActiveTab] = useState<'overview' | 'presence' | 'history' | 'marks' | 'messages' | 'community'>('overview');
    const [tutorSubject, setTutorSubject] = useState<string | null>(null);
    const [nextClassInfo, setNextClassInfo] = useState<NextClassInfo | null>(null);
    const [notification, setNotification] = useState<AppNotification | null>(null);
    const notifiedClassRef = useRef<string | null>(null);

    const studentPersistentId = useMemo(() => {
        for (const [pid, roll] of faceLinks.entries()) {
            if (roll === currentUser.rollNumber) return pid;
        }
        return null;
    }, [faceLinks, currentUser.rollNumber]);
    
    // Effect for finding next class and sending notifications
    useEffect(() => {
        const NOTIFICATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

        const checkSchedule = () => {
            const nextClass = findNextClass(currentUser, timeTable, holidays);
            setNextClassInfo(nextClass);

            if (nextClass && nextClass.timeToClass > 0 && nextClass.timeToClass < NOTIFICATION_WINDOW_MS) {
                if (notifiedClassRef.current !== nextClass.entry.id) {
                    setNotification({
                        id: `notif-${nextClass.entry.id}`,
                        title: `Upcoming Class: ${nextClass.entry.subject}`,
                        message: `Your class starts in less than 10 minutes.`,
                    });
                    notifiedClassRef.current = nextClass.entry.id;
                }
            }
        };

        checkSchedule(); // Initial check
        const intervalId = setInterval(checkSchedule, 60 * 1000); // Check every minute
        return () => clearInterval(intervalId);
    }, [currentUser, timeTable, holidays]);


    const { status, lastLog } = useMemo((): { status: AttendanceStatus; lastLog: Date | null } => {
        if (currentUser.blockExpiresAt && currentUser.blockExpiresAt > Date.now()) {
            return { status: 'BLOCKED', lastLog: null };
        }
        if (!studentPersistentId) {
            return { status: 'UNLINKED', lastLog: null };
        }
        
        const today = new Date().toDateString();
        const todaysRecords = attendance
            .filter(rec => rec.persistentId === studentPersistentId && new Date(rec.timestamp).toDateString() === today)
            .sort((a, b) => b.timestamp - a.timestamp);

        if (todaysRecords.length > 0) {
            return { status: 'PRESENT', lastLog: new Date(todaysRecords[0].timestamp) };
        }
        
        return { status: 'ABSENT', lastLog: null };

    }, [currentUser, studentPersistentId, attendance]);

    const handleMarkAttendance = async (base64Data: string) => {
        if (status === 'BLOCKED' || status === 'UNLINKED' || !studentPersistentId) throw new Error("Student face is not linked.");
        const subject = nextClassInfo && nextClassInfo.timeToClass <= 0 ? nextClassInfo.entry.subject : undefined;
        try {
            const result = await detectSingleFaceEmotion(base64Data);
            if (result && result.emotion) {
                onLogAttendance(studentPersistentId, result.emotion, subject);
            } else {
                throw new Error("No face detected. Please ensure you are clearly visible in the photo.");
            }
        } catch (err) {
            console.error("API Error marking attendance:", err);
            const message = err instanceof Error ? err.message : "Could not verify attendance. Please try again.";
            throw new Error(message);
        }
    };
    
    const handleLinkFace = async (base64Data: string) => {
        if (currentUser.blockExpiresAt && currentUser.blockExpiresAt > Date.now()) throw new Error("Cannot link face while account is blocked.");
        try {
            await onLinkFace();
        } catch (err) { console.error("Link Face Error:", err); throw err; }
    };

    const handleCapture = (base64Data: string) => captureMode === 'MARK' ? handleMarkAttendance(base64Data) : handleLinkFace(base64Data);
    
    const blockedByAdmin = useMemo(() => currentUser.blockedBy ? adminDirectory.get(currentUser.blockedBy)?.name || 'an Administrator' : 'an Administrator', [currentUser.blockedBy, adminDirectory]);

    const renderContent = () => {
        switch(activeTab) {
            case 'overview':
                return (
                    <div className="w-full grid grid-cols-1 lg:grid-cols-5 gap-6 animate-fade-in">
                        <div className="lg:col-span-3">
                            <UpNextWidget nextClassInfo={nextClassInfo} adminDirectory={adminDirectory} />
                        </div>
                        <div className="lg:col-span-2 space-y-4">
                            <AttendanceSnapshotWidget attendance={attendance} persistentId={studentPersistentId} />
                            <div className="grid grid-cols-2 gap-4">
                                <QuickActionWidget title="Mark Attendance" icon={<CameraIcon className="w-8 h-8"/>} onClick={() => { setCaptureMode('MARK'); setIsCaptureModalOpen(true); }} disabled={status !== 'ABSENT'} />
                                <QuickActionWidget title="AI Tutor" icon={<SparklesIcon className="w-8 h-8"/>} onClick={() => setTutorSubject(nextClassInfo?.entry.subject || 'General Studies')} />
                            </div>
                        </div>
                        <div className="lg:col-span-5">
                             <AIAcademicAdvisorPanel currentUser={currentUser} attendance={attendance.filter(a => a.persistentId === studentPersistentId)} timeTable={timeTable} />
                        </div>
                    </div>
                );
            case 'presence':
                return <TeacherAvailabilityPanel student={currentUser} timeTable={timeTable} adminDirectory={adminDirectory} />;
            case 'history':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><AttendanceCalendar studentAttendance={attendance.filter(rec => rec.persistentId === studentPersistentId)} /></div>
                        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                             <h3 className="text-xl font-bold text-white mb-4">How it works</h3>
                             <div className="space-y-3 text-gray-400">
                                <p>This calendar shows all the days you have been marked <span className="font-semibold text-green-400">present</span>.</p>
                                <p>A day is marked as present if you have at least one attendance record for that day.</p>
                                <p>Days you were absent are shown with a <span className="font-semibold text-gray-600 line-through">strikethrough</span>. Future dates are grayed out.</p>
                             </div>
                        </div>
                    </div>
                );
            case 'marks':
                return <MyMarksPanel marks={currentUser.marks || []} />;
            case 'messages':
                return <CommunicationPanel currentUser={{...currentUser, userType: 'STUDENT'}} conversations={conversations} onSendMessage={onSendMessage} studentDirectory={props.studentDirectory} adminDirectory={adminDirectory} timeTable={timeTable} />;
            case 'community':
                return <CommunityPanel 
                            currentUser={props.currentUser}
                            studyGroups={props.studyGroups}
                            sharedNotes={props.sharedNotes}
                            onCreateStudyGroup={props.onCreateStudyGroup}
                            onJoinStudyGroup={props.onJoinStudyGroup}
                            onSendGroupMessage={props.onSendGroupMessage}
                            onUploadNote={props.onUploadNote}
                            onRateNote={props.onRateNote}
                            onSuggestStudyTime={props.onSuggestStudyTime}
                            onSummarizeNote={props.onSummarizeNote}
                        />;
        }
    };


    return (
        <div className="w-full max-w-7xl mx-auto flex flex-col animate-slide-up p-4 sm:p-6 lg:p-8">
             {isCaptureModalOpen && (
                <AttendanceCaptureModal
                    onClose={() => setIsCaptureModalOpen(false)}
                    onCapture={handleCapture}
                    title={captureMode === 'MARK' ? "Mark Attendance" : "Link Face ID"}
                    actionText={captureMode === 'MARK' ? "Capture & Mark" : "Capture & Link"}
                />
            )}
            {tutorSubject && <AITutorModal subject={tutorSubject} onClose={() => setTutorSubject(null)} />}
             <header className="mb-6 w-full flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    {currentUser.photoBase64 ? (
                        <img src={currentUser.photoBase64} alt={currentUser.name} className="w-14 h-14 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600" />
                    ) : (
                        <img src="https://krucet.ac.in/wp-content/uploads/2020/09/cropped-kru-150-round-non-transparent-1.png" alt="Krishna University Logo" className="w-14 h-14 rounded-full" />
                    )}
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Welcome, {currentUser.name}!</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{currentUser.rollNumber} | {currentUser.department} - {currentUser.year} - Sec {currentUser.section}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                     <button
                        onClick={onNavigateToSettings}
                        onMouseMove={handleMouseMove}
                        className="btn-animated px-4 py-2 rounded-lg font-semibold text-gray-800 dark:text-white bg-gray-200 dark:bg-gray-700 transition-all duration-100 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900 focus:ring-gray-500 shadow-lg"
                    >
                        <span className="btn-content"><span className="btn-dot"></span><span>Settings</span></span>
                    </button>
                    <button
                        onClick={onLogout}
                        onMouseMove={handleMouseMove}
                        className="btn-animated px-4 py-2 rounded-lg font-semibold text-white bg-rose-600 transition-all duration-100 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900 focus:ring-rose-500 shadow-lg"
                    >
                        <span className="btn-content"><span className="btn-dot"></span><span>Logout</span></span>
                    </button>
                </div>
            </header>

            <main className="w-full">
                {notification && <NotificationBanner notification={notification} onDismiss={() => setNotification(null)} />}
                <div className="mb-6">
                    <nav className="flex space-x-2 sm:space-x-4 bg-gray-100 dark:bg-gray-800/50 p-2 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto no-scrollbar" aria-label="Tabs">
                         <button onClick={() => setActiveTab('overview')} className={`flex-1 sm:flex-none justify-center whitespace-nowrap py-2 px-4 font-medium text-sm sm:text-base rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50'}`}>
                            Overview
                        </button>
                         <button onClick={() => setActiveTab('presence')} className={`flex-1 sm:flex-none justify-center whitespace-nowrap py-2 px-4 font-medium text-sm sm:text-base rounded-lg transition-colors ${activeTab === 'presence' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50'}`}>
                            Teacher Presence
                        </button>
                         <button onClick={() => setActiveTab('history')} className={`flex-1 sm:flex-none justify-center whitespace-nowrap py-2 px-4 font-medium text-sm sm:text-base rounded-lg transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50'}`}>
                            Attendance History
                        </button>
                         <button onClick={() => setActiveTab('marks')} className={`flex-1 sm:flex-none justify-center whitespace-nowrap py-2 px-4 font-medium text-sm sm:text-base rounded-lg transition-colors ${activeTab === 'marks' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50'}`}>
                            My Marks
                        </button>
                         <button onClick={() => setActiveTab('messages')} className={`flex-1 sm:flex-none justify-center whitespace-nowrap py-2 px-4 font-medium text-sm sm:text-base rounded-lg transition-colors ${activeTab === 'messages' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50'}`}>
                            Messages
                        </button>
                         <button onClick={() => setActiveTab('community')} className={`flex-1 sm:flex-none justify-center whitespace-nowrap py-2 px-4 font-medium text-sm sm:text-base rounded-lg transition-colors ${activeTab === 'community' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50'}`}>
                            Community
                        </button>
                    </nav>
                </div>
                {renderContent()}
            </main>
        </div>
    );
};