import { 
    loadStudentDirectory, saveStudentDirectory, 
    loadAdminDirectory, saveAdminDirectory,
    loadFaceLinks, saveFaceLinks,
    loadAttendance, saveAttendance, 
    loadDepartments, saveDepartments,
    loadVerificationTokens, saveVerificationTokens,
    loadPasswordResetTokens, savePasswordResetTokens,
    loadTimeTable, saveTimeTable,
    loadLeaveRecords, saveLeaveRecords,
    loadConversations, saveConversations,
    loadHolidays, saveHolidays,
    loadStudyGroups, saveStudyGroups,
    loadSharedNotes, saveSharedNotes
} from './storageService';
// FIX: Import AttendanceAnomaly type.
import { StudentInfo, AdminInfo, AttendanceRecord, Emotion, Designation, VerificationToken, PasswordResetToken, TimeTableEntry, LeaveRecord, Conversation, ChatMessage, Holiday, Year, StudyGroup, SharedNote, GroupChatMessage, NoteRating, AttendanceAnomaly } from '../types';
import { logAdminAction } from './logService';
import { sendVerificationEmail, sendPasswordResetEmail, sendUnblockNotificationEmail, sendLeaveNotificationEmail, sendHolidayNotificationEmail, sendLeaveStatusNotificationEmail } from './emailService';
// FIX: Import analyzeAttendanceAnomalies from geminiService.
import { suggestSubstituteTeacher, rescheduleClass, suggestStudyTime as geminiSuggestStudyTime, summarizeNoteContent as geminiSummarizeNote, analyzeAttendanceAnomalies } from './geminiService';


const API_LATENCY = 200; // ms
const TOKEN_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes

// Custom Error for Blocked Login
export class BlockedLoginError extends Error {
    details: { blockedBy: string | null; expiresAt: number | null };
    constructor(message: string, details: { blockedBy: string | null; expiresAt: number | null }) {
        super(message);
        this.name = 'BlockedLoginError';
        this.details = details;
    }
}

// Helper to decode Base64 to UTF-8
function base64ToUtf8(str: string): string {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}


// --- Token Generation ---
const generateAndSaveVerificationToken = (identifier: string): VerificationToken => {
    const tokens = loadVerificationTokens();
    // Remove any existing tokens for this user
    const otherTokens = tokens.filter(t => t.identifier !== identifier);
    
    const token: VerificationToken = {
        identifier,
        token: Math.floor(100000 + Math.random() * 900000).toString(),
        expiresAt: Date.now() + TOKEN_EXPIRATION_MS,
    };
    
    saveVerificationTokens([...otherTokens, token]);
    return token;
};

const generateAndSavePasswordResetToken = (identifier: string): PasswordResetToken => {
    const tokens = loadPasswordResetTokens();
    const otherTokens = tokens.filter(t => t.identifier !== identifier);
    const token: PasswordResetToken = {
        identifier,
        token: `KU-RESET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        expiresAt: Date.now() + TOKEN_EXPIRATION_MS,
    };
    savePasswordResetTokens([...otherTokens, token]);
    return token;
};


// --- Auth & Password Management ---
export const loginAdmin = (idNumber: string, password: string): Promise<AdminInfo> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const admins = loadAdminDirectory();
            const user = admins.get(idNumber);
            if (user && user.password === password) {
                if (user.isBlocked) {
                    reject(new Error('This admin account is blocked.'));
                } else if (!user.isVerified) {
                    reject(new Error('Account not verified. Please check your email.'));
                } else {
                    resolve(user);
                }
            } else {
                reject(new Error('Invalid credentials. Please try again.'));
            }
        }, API_LATENCY);
    });
};

export const loginStudent = (rollNumber: string, password: string): Promise<StudentInfo> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const students = loadStudentDirectory();
            const user = students.get(rollNumber.toUpperCase());
            if (user && user.password === password) {
                if (user.blockExpiresAt && user.blockExpiresAt > Date.now()) {
                    const expiryTime = user.blockExpiresAt === Infinity ? 'permanently' : `until ${new Date(user.blockExpiresAt).toLocaleTimeString()}`;
                     reject(new BlockedLoginError(
                        `This student account is blocked ${expiryTime}.`,
                        { blockedBy: user.blockedBy, expiresAt: user.blockExpiresAt }
                    ));
                } else if (user.blockExpiresAt && user.blockExpiresAt <= Date.now()){
                    // Automatic unblock for expired temporary blocks
                    const admins = loadAdminDirectory();
                    const adminName = admins.get(user.blockedBy || '')?.name || 'System';
                    user.blockExpiresAt = null;
                    user.blockedBy = null;
                    students.set(user.rollNumber, user);
                    saveStudentDirectory(students);
                    sendUnblockNotificationEmail(user.email, adminName, true);
                    resolve(user);
                } else {
                    resolve(user); // Resolve even if not verified, UI will handle redirection
                }
            } else {
                reject(new Error('Invalid credentials. Please try again.'));
            }
        }, API_LATENCY);
    });
};

export const requestPasswordReset = (email: string): Promise<PasswordResetToken> => {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            const students = loadStudentDirectory();
            const admins = loadAdminDirectory();
            const lowerCaseEmail = email.toLowerCase();

            let userFound = false;
            for (const user of [...students.values(), ...admins.values()]) {
                if (user.email.toLowerCase() === lowerCaseEmail) {
                    userFound = true;
                    break;
                }
            }

            if (!userFound) {
                return reject(new Error("No account found with that email address."));
            }

            const resetToken = generateAndSavePasswordResetToken(lowerCaseEmail);
            await sendPasswordResetEmail(lowerCaseEmail, resetToken.token);
            resolve(resetToken);
        }, API_LATENCY);
    });
};

export const resetPassword = (token: string, newPassword: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const tokens = loadPasswordResetTokens();
            const storedToken = tokens.find(t => t.token === token);

            if (!storedToken) return reject(new Error("Invalid or expired password reset token."));
            if (storedToken.expiresAt < Date.now()) return reject(new Error("Password reset token has expired."));

            const email = storedToken.identifier;
            let userUpdated = false;

            const students = loadStudentDirectory();
            for (const student of students.values()) {
                if (student.email.toLowerCase() === email) {
                    student.password = newPassword;
                    students.set(student.rollNumber, student);
                    saveStudentDirectory(students);
                    userUpdated = true;
                    break;
                }
            }

            if (!userUpdated) {
                const admins = loadAdminDirectory();
                for (const admin of admins.values()) {
                    if (admin.email.toLowerCase() === email) {
                        admin.password = newPassword;
                        admins.set(admin.idNumber, admin);
                        saveAdminDirectory(admins);
                        userUpdated = true;
                        break;
                    }
                }
            }
            
            if (userUpdated) {
                savePasswordResetTokens(tokens.filter(t => t.token !== token)); // Invalidate token
                resolve();
            } else {
                reject(new Error("Could not find user to update password for."));
            }
        }, API_LATENCY);
    });
};

export const changePassword = (identifier: string, userType: 'STUDENT' | 'ADMIN', currentPassword: string, newPassword: string): Promise<{ updatedUser: StudentInfo | AdminInfo, userType: 'STUDENT' | 'ADMIN' }> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (userType === 'STUDENT') {
                const students = loadStudentDirectory();
                const student = students.get(identifier);
                if (!student) return reject(new Error("Student not found."));
                if (student.password !== currentPassword) return reject(new Error("Current password does not match."));
                
                student.password = newPassword;
                students.set(identifier, student);
                saveStudentDirectory(students);
                resolve({ updatedUser: student, userType: 'STUDENT' });
            } else {
                const admins = loadAdminDirectory();
                const admin = admins.get(identifier);
                if (!admin) return reject(new Error("Admin not found."));
                if (admin.password !== currentPassword) return reject(new Error("Current password does not match."));

                admin.password = newPassword;
                admins.set(identifier, admin);
                saveAdminDirectory(admins);
                resolve({ updatedUser: admin, userType: 'ADMIN' });
            }
        }, API_LATENCY);
    });
};

// --- Registration ---
export const registerStudent = (student: Omit<StudentInfo, 'blockExpiresAt' | 'isVerified' | 'blockedBy' | 'onboarded' | 'marks' | 'predictions'>): Promise<StudentInfo> => {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            try {
                const students = loadStudentDirectory();
                if (students.has(student.rollNumber)) {
                    return reject(new Error('A student with this Roll Number already exists.'));
                }
                // Check for duplicate email
                for (const s of students.values()) {
                    if (s.email.toLowerCase() === student.email.toLowerCase()) {
                       return reject(new Error('A student with this email address already exists.'));
                    }
                }
                
                const newStudent: StudentInfo = { 
                    ...student, 
                    marks: [], 
                    predictions: [],
                    blockExpiresAt: null, 
                    blockedBy: null, 
                    isVerified: false, 
                    onboarded: true, // User is onboarded as password and photo are set
                };
                students.set(newStudent.rollNumber, newStudent);
                saveStudentDirectory(students);
                
                const verificationToken = generateAndSaveVerificationToken(newStudent.rollNumber);
                await sendVerificationEmail(newStudent.email, verificationToken.token);
                
                resolve(newStudent);
            } catch(e) {
                reject(e);
            }
        }, API_LATENCY);
    });
};

export const registerStudentsBulk = (
    studentsData: Omit<StudentInfo, 'blockExpiresAt' | 'isVerified' | 'password' | 'blockedBy' | 'onboarded' | 'marks' | 'predictions'>[],
    adminId: string
): Promise<{ successful: StudentInfo[], failed: { studentData: any, reason: string }[] }> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            const students = loadStudentDirectory();
            const allUsers = [...Array.from(students.values()), ...Array.from(loadAdminDirectory().values())];
            const existingEmails = new Set(allUsers.map(u => u.email.toLowerCase()));
            
            const successful: StudentInfo[] = [];
            const failed: { studentData: any, reason: string }[] = [];

            studentsData.forEach(student => {
                // Validation
                const upperRollNumber = student.rollNumber.toUpperCase();
                if (students.has(upperRollNumber)) {
                    failed.push({ studentData: student, reason: 'Roll Number already exists.' });
                    return;
                }
                if (existingEmails.has(student.email.toLowerCase())) {
                    failed.push({ studentData: student, reason: `Email ${student.email} already in use.` });
                    return;
                }

                // Create new student
                const newStudent: StudentInfo = {
                    ...student,
                    rollNumber: upperRollNumber,
                    password: `Pass@${upperRollNumber.slice(-4)}`, // Default password
                    marks: [],
                    predictions: [],
                    blockExpiresAt: null,
                    blockedBy: null,
                    isVerified: false,
                    onboarded: false,
                };
                students.set(newStudent.rollNumber, newStudent);
                existingEmails.add(newStudent.email.toLowerCase()); // Add to set to catch duplicates within the same file
                successful.push(newStudent);

                // Send verification email (fire and forget)
                const verificationToken = generateAndSaveVerificationToken(newStudent.rollNumber);
                sendVerificationEmail(newStudent.email, verificationToken.token);
            });

            saveStudentDirectory(students);
            logAdminAction(adminId, 'Bulk Student Registration', `Registered ${successful.length} new students. Failed: ${failed.length}.`);
            resolve({ successful, failed });
        }, API_LATENCY * 2); // A bit more latency for a bulk operation
    });
};

export const completeStudentOnboarding = (rollNumber: string, photoBase64: string, newPassword: string): Promise<StudentInfo> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const students = loadStudentDirectory();
            const student = students.get(rollNumber.toUpperCase());
            if (!student) {
                return reject(new Error("Student not found during onboarding."));
            }
            student.photoBase64 = photoBase64;
            student.password = newPassword;
            student.onboarded = true;
            students.set(student.rollNumber, student);
            saveStudentDirectory(students);
            resolve(student);
        }, API_LATENCY);
    });
};


export const registerAdmin = (admin: Omit<AdminInfo, 'isVerified' | 'isBlocked'>): Promise<{ newAdmin: AdminInfo; updatedDepartments: string[] }> => {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            try {
                const admins = loadAdminDirectory();
                if (admins.has(admin.idNumber)) {
                    return reject(new Error('An admin with this ID Number already exists.'));
                }
                 // Check for duplicate email
                for (const a of admins.values()) {
                    if (a.email.toLowerCase() === admin.email.toLowerCase()) {
                        return reject(new Error('An admin with this email address already exists.'));
                    }
                }
                
                const departments = loadDepartments();
                if (admin.department && !departments.includes(admin.department)) {
                    departments.push(admin.department);
                    saveDepartments(departments);
                }
                
                const newAdmin: AdminInfo = { 
                    ...admin, 
                    isBlocked: false, 
                    isVerified: false, 
                    isPresentToday: true,
                };
                admins.set(newAdmin.idNumber, newAdmin);
                saveAdminDirectory(admins);

                const verificationToken = generateAndSaveVerificationToken(newAdmin.idNumber);
                await sendVerificationEmail(newAdmin.email, verificationToken.token);
                
                resolve({ newAdmin, updatedDepartments: departments });
            } catch(e) {
                reject(e);
            }
        }, API_LATENCY);
    });
};

// --- Verification ---
export const verifyUser = (identifier: string, token: string, userType: 'STUDENT' | 'ADMIN'): Promise<void> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const tokens = loadVerificationTokens();
            const storedToken = tokens.find(t => t.identifier === identifier && t.token === token);

            if (!storedToken) {
                return reject(new Error("Invalid verification code."));
            }
            if (storedToken.expiresAt < Date.now()) {
                return reject(new Error("Verification code has expired."));
            }

            if (userType === 'STUDENT') {
                const students = loadStudentDirectory();
                const student = students.get(identifier);
                if (student) {
                    student.isVerified = true;
                    students.set(identifier, student);
                    saveStudentDirectory(students);
                }
            } else {
                const admins = loadAdminDirectory();
                const admin = admins.get(identifier);
                if (admin) {
                    admin.isVerified = true;
                    admins.set(identifier, admin);
                    saveAdminDirectory(admins);
                }
            }
            
            // Remove the used token
            saveVerificationTokens(tokens.filter(t => t.token !== token));
            resolve();
        }, API_LATENCY);
    });
};

export const resendVerificationToken = (identifier: string, userType: 'STUDENT' | 'ADMIN'): Promise<void> => {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            let userEmail: string | undefined;
            if (userType === 'STUDENT') {
                userEmail = loadStudentDirectory().get(identifier)?.email;
            } else {
                userEmail = loadAdminDirectory().get(identifier)?.email;
            }

            if (!userEmail) {
                return reject(new Error("User not found."));
            }

            const newVerificationToken = generateAndSaveVerificationToken(identifier);
            await sendVerificationEmail(userEmail, newVerificationToken.token);
            resolve();
        }, API_LATENCY);
    });
};


// --- Data Fetching ---
export const getStudentDirectory = (): Promise<Map<string, StudentInfo>> => {
    const students = loadStudentDirectory();
    // Helper function to create a demo student
    const createDemoStudent = (id: string, name: string, dept: string, year: Year, section: string, email: string) => {
        if (!students.has(id)) {
            students.set(id, {
                name: name,
                rollNumber: id,
                department: dept,
                year: year,
                section: section,
                email: email,
                password: 'student',
                phoneNumber: '9876543210',
                blockExpiresAt: null,
                blockedBy: null,
                isVerified: true,
                onboarded: true,
                photoBase64: 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
                marks: [
                    { subject: 'Data Structures', mid1: 85, mid2: 78 },
                    { subject: 'Algorithms', mid1: 92, mid2: null },
                ],
                predictions: []
            });
            return true;
        }
        return false;
    };

    let hasChanged = false;
    if (createDemoStudent('DEMO-STUDENT', 'Demo Student', 'CSE', Year.Second, '1', 'student@kru.ac.in')) hasChanged = true;
    if (createDemoStudent('DEMO-STUDENT-2', 'Alex Ray', 'CSE', Year.Second, '1', 'alex@kru.ac.in')) hasChanged = true;
    if (createDemoStudent('DEMO-STUDENT-3', 'Beth Smith', 'CSE', Year.Second, '1', 'beth@kru.ac.in')) hasChanged = true;
    if (createDemoStudent('DEMO-STUDENT-4', 'Charlie Day', 'ECE', Year.Second, '1', 'charlie@kru.ac.in')) hasChanged = true;

    if (hasChanged) {
        saveStudentDirectory(students);
    }
    
    return Promise.resolve(students);
};

export const getAdminDirectory = (): Promise<Map<string, AdminInfo>> => {
    const admins = loadAdminDirectory();
    let hasChanged = false;

    // Create a default principal if none exist
    if (admins.size === 0) {
        const principal: AdminInfo = {
            name: 'Default Principal',
            idNumber: 'principal',
            password: 'admin',
            email: 'principal@kru.ac.in',
            department: 'Administration',
            designation: Designation.Principal,
            phoneNumber: '1234567890',
            isBlocked: false,
            isVerified: true, // Auto-verify the default admin
            isPresentToday: true,
        };
        const chairman: AdminInfo = {
            name: 'Default Chairman',
            idNumber: 'chairman',
            password: 'admin',
            email: 'chairman@kru.ac.in',
            department: 'Administration',
            designation: Designation.Chairman,
            phoneNumber: '1234567890',
            isBlocked: false,
            isVerified: true,
            isPresentToday: true,
        };
        admins.set(principal.idNumber, principal);
        admins.set(chairman.idNumber, chairman);
        hasChanged = true;
    }

     if (!admins.has('hod-cse')) {
        const hod: AdminInfo = {
            name: 'Demo HOD',
            idNumber: 'hod-cse',
            password: 'admin',
            email: 'hod.cse@kru.ac.in',
            department: 'CSE',
            designation: Designation.HOD,
            phoneNumber: '1112223333',
            isBlocked: false,
            isVerified: true,
            isPresentToday: true,
        };
        admins.set(hod.idNumber, hod);
        hasChanged = true;
    }
    
    if (!admins.has('teacher-ece')) {
        const teacher: AdminInfo = {
            name: 'Demo Teacher',
            idNumber: 'teacher-ece',
            password: 'admin',
            email: 'teacher.ece@kru.ac.in',
            department: 'ECE',
            designation: Designation.Teacher,
            phoneNumber: '4445556666',
            isBlocked: false,
            isVerified: true,
            isPresentToday: true,
        };
        admins.set(teacher.idNumber, teacher);
        hasChanged = true;
    }

    // Create 5 demo CSE teachers
    for (let i = 1; i <= 5; i++) {
        const teacherId = `teacher-cse-${i}`;
        if (!admins.has(teacherId)) {
            const teacher: AdminInfo = {
                name: `Demo CSE Teacher ${i}`,
                idNumber: teacherId,
                password: 'admin',
                email: `teacher.cse.${i}@kru.ac.in`,
                department: 'CSE',
                designation: Designation.Teacher,
                phoneNumber: `123123123${i}`,
                isBlocked: false,
                isVerified: true,
                isPresentToday: true,
            };
            admins.set(teacher.idNumber, teacher);
            hasChanged = true;
        }
    }

    // Create demo incharges for all years in CSE
    const years = Object.values(Year);
    years.forEach((year, index) => {
        const yearNumber = index + 1;
        const inchargeId = `incharge-cse-${yearNumber}y`;
        if (!admins.has(inchargeId)) {
            const incharge: AdminInfo = {
                name: `Demo Incharge (CSE ${year})`,
                idNumber: inchargeId,
                password: 'admin',
                email: `incharge.cse.${yearNumber}y@kru.ac.in`,
                department: 'CSE',
                designation: Designation.Incharge,
                year: year,
                section: 'All Sections', // For all sections of that year
                phoneNumber: `456456456${yearNumber}`,
                isBlocked: false,
                isVerified: true,
                isPresentToday: true,
            };
            admins.set(incharge.idNumber, incharge);
            hasChanged = true;
        }
    });

    if (hasChanged) {
        saveAdminDirectory(admins);
    }

    return Promise.resolve(admins);
};
export const getFaceLinks = (): Promise<Map<number, string>> => Promise.resolve(loadFaceLinks());
export const getAttendance = (): Promise<AttendanceRecord[]> => Promise.resolve(loadAttendance());
export const getDepartments = (): Promise<string[]> => Promise.resolve(loadDepartments());
export const getTimeTable = (): Promise<TimeTableEntry[]> => Promise.resolve(loadTimeTable());
export const getLeaveRecords = (): Promise<LeaveRecord[]> => Promise.resolve(loadLeaveRecords());
export const getHolidays = (): Promise<Holiday[]> => Promise.resolve(loadHolidays());

export const getStudyGroups = (): Promise<StudyGroup[]> => {
    let groups = loadStudyGroups();
    const students = loadStudentDirectory();
    let groupsChanged = false;
    let studentsChanged = false;

    const demoGroupId = 'group-1678886400000';
    let demoGroup = groups.find(g => g.id === demoGroupId);

    if (!demoGroup) {
        demoGroup = {
            id: demoGroupId,
            name: 'Data Structures Study Group',
            description: 'Preparing for mid-terms and practicing coding problems for Data Structures.',
            subject: 'Data Structures',
            department: 'CSE',
            year: Year.Second,
            section: '1',
            members: [],
            maxSize: 8,
            createdBy: 'DEMO-STUDENT-2',
            events: [],
            messages: [],
        };
        groups.push(demoGroup);
        groupsChanged = true;
    }

    // --- Ensure Demo Group State is Correct ---
    const demoMembers = ['DEMO-STUDENT-2', 'DEMO-STUDENT-3', 'DEMO-STUDENT'];
    
    // Check members and update if necessary
    if (!demoMembers.every(m => demoGroup!.members.includes(m))) {
        demoGroup.members = demoMembers;
        groupsChanged = true;
    }

    // Check for messages and add them if they don't exist
    if (demoGroup.messages.length === 0) {
        demoGroup.messages = [
            {
                id: `msg-${Date.now() - 300000}`, // 5 mins ago
                senderId: 'DEMO-STUDENT-2',
                timestamp: Date.now() - 300000,
                content: "Hey everyone! Glad we could make this group. I'm struggling a bit with recursion, anyone have good resources?",
            },
            {
                id: `msg-${Date.now() - 180000}`, // 3 mins ago
                senderId: 'DEMO-STUDENT-3',
                timestamp: Date.now() - 180000,
                content: "Yeah, recursion can be tricky. I found a great YouTube playlist, I'll share the link.",
            },
            {
                id: `msg-${Date.now() - 120000}`, // 2 mins ago
                senderId: 'DEMO-STUDENT-3',
                timestamp: Date.now() - 120000,
                content: "Here it is.",
                file: { 
                    name: 'Recursion Explained.txt', 
                    // Base64 for: "This is a demo file with a link to a helpful video:\n\nhttps://www.youtube.com/watch?v=Mv9NEXX1VHc"
                    url: `data:text/plain;base64,${btoa("This is a demo file with a link to a helpful video:\n\nhttps://www.youtube.com/watch?v=Mv9NEXX1VHc")}` 
                }
            },
        ];
        groupsChanged = true;
    }

    // --- Ensure Student Records Reflect Group Membership ---
    demoMembers.forEach(memberId => {
        const student = students.get(memberId);
        if (student) {
            if (!student.studyGroupIds) {
                student.studyGroupIds = [];
            }
            if (!student.studyGroupIds.includes(demoGroupId)) {
                student.studyGroupIds.push(demoGroupId);
                students.set(memberId, student);
                studentsChanged = true;
            }
        }
    });

    if (groupsChanged) {
        const groupIndex = groups.findIndex(g => g.id === demoGroupId);
        if (groupIndex !== -1) {
            groups[groupIndex] = demoGroup;
        }
        saveStudyGroups(groups);
    }
    if (studentsChanged) {
        saveStudentDirectory(students);
    }

    return Promise.resolve(groups);
};

export const getSharedNotes = (): Promise<SharedNote[]> => Promise.resolve(loadSharedNotes());

export const getAllUsersWithPhotos = (): Promise<{ id: string; photoBase64: string }[]> => {
    return new Promise((resolve) => {
        const students = loadStudentDirectory();
        const admins = loadAdminDirectory();
        const userProfiles: { id: string; photoBase64: string }[] = [];

        students.forEach((student, rollNumber) => {
            if (student.photoBase64 && student.isVerified && !(student.blockExpiresAt && student.blockExpiresAt > Date.now())) {
                userProfiles.push({ id: rollNumber, photoBase64: student.photoBase64 });
            }
        });

        admins.forEach((admin, idNumber) => {
            if (admin.photoBase64 && admin.isVerified && !admin.isBlocked) {
                userProfiles.push({ id: idNumber, photoBase64: admin.photoBase64 });
            }
        });
        resolve(userProfiles);
    });
};

export const getUserById = (id: string): Promise<(AdminInfo & { userType: 'ADMIN' }) | (StudentInfo & { userType: 'STUDENT' }) | null> => {
     return new Promise((resolve) => {
        const adminUser = loadAdminDirectory().get(id);
        if (adminUser) {
            resolve({ ...adminUser, userType: 'ADMIN' });
            return;
        }
        const studentUser = loadStudentDirectory().get(id.toUpperCase());
        if (studentUser) {
            resolve({ ...studentUser, userType: 'STUDENT' });
            return;
        }
        resolve(null);
     });
};


// --- Data Mutation ---
export type MarkUpdate = {
    rollNumber: string;
    subject: string;
    midTerm: 'mid1' | 'mid2';
    marks: number | null;
};

export const updateBulkStudentMarks = (updates: MarkUpdate[], adminId: string): Promise<Map<string, StudentInfo>> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            const students = loadStudentDirectory();
            
            updates.forEach(update => {
                const student = students.get(update.rollNumber);
                if (student) {
                    if (!student.marks) {
                        student.marks = [];
                    }
                    // Case-insensitive subject matching
                    let subjectMarks = student.marks.find(m => m.subject.toLowerCase() === update.subject.toLowerCase());
                    if (subjectMarks) {
                        subjectMarks[update.midTerm] = update.marks;
                    } else {
                        student.marks.push({
                            subject: update.subject,
                            mid1: update.midTerm === 'mid1' ? update.marks : null,
                            mid2: update.midTerm === 'mid2' ? update.marks : null,
                        });
                    }
                    students.set(student.rollNumber, student);
                }
            });

            saveStudentDirectory(students);
            logAdminAction(adminId, 'Bulk Marks Update', `Updated marks for ${updates.length} students. Subject: ${updates[0]?.subject || 'N/A'}`);
            resolve(students);
        }, API_LATENCY);
    });
};

export const linkFaceToStudent = (persistentId: number, rollNumber: string): Promise<Map<number, string>> => {
    return new Promise((resolve) => {
        const links = loadFaceLinks();
        links.set(persistentId, rollNumber);
        saveFaceLinks(links);
        resolve(links);
    });
};

export const linkNewFaceForStudent = (rollNumber: string): Promise<Map<number, string>> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            const links = loadFaceLinks();
            
            // Find and remove any existing links for this student to allow re-linking.
            const pidsToDelete: number[] = [];
            for (const [pid, rn] of links.entries()) {
                if (rn === rollNumber) {
                    pidsToDelete.push(pid);
                }
            }
            pidsToDelete.forEach(pid => links.delete(pid));

            const existingIds = Array.from(links.keys());
            // Use Math.max(0, ...) to handle empty array case gracefully.
            const newId = existingIds.length > 0 ? Math.max(0, ...existingIds) + 1 : 1;
            
            links.set(newId, rollNumber);
            saveFaceLinks(links);
            resolve(links);
        }, API_LATENCY);
    });
};

export const deleteStudent = (rollNumber: string, adminId: string): Promise<{updatedStudents: Map<string, StudentInfo>, updatedFaceLinks: Map<number, string>, updatedAttendance: AttendanceRecord[]}> => {
    return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));

        const students = loadStudentDirectory();
        const student = students.get(rollNumber);
        if (!student) return reject(new Error("Student to be deleted not found."));

        // PERMISSION CHECK
        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
        if (highPrivilegeRoles.includes(admin.designation)) {
            // High privilege, allow action.
        } else if (admin.designation === Designation.HOD) {
            if (student.department !== admin.department) {
                return reject(new Error("HODs can only delete students from their own department."));
            }
        } else {
            return reject(new Error("You do not have permission to delete students."));
        }
        
        const links = loadFaceLinks();
        const attendance = loadAttendance();

        let persistentIdToDelete: number | null = null;
        for (const [pid, rn] of links.entries()) {
            if (rn === rollNumber) {
                persistentIdToDelete = pid;
                break;
            }
        }

        if (persistentIdToDelete !== null) {
            links.delete(persistentIdToDelete);
            saveFaceLinks(links);
        }
        
        const newAttendance = attendance.filter(record => record.persistentId !== persistentIdToDelete);
        saveAttendance(newAttendance);

        students.delete(rollNumber);
        saveStudentDirectory(students);
        logAdminAction(adminId, 'Delete Student', `Deleted student with Roll Number: ${rollNumber}`);
        
        resolve({ updatedStudents: students, updatedFaceLinks: links, updatedAttendance: newAttendance });
    });
};

export const deleteStudents = (rollNumbers: string[], adminId: string): Promise<{updatedStudents: Map<string, StudentInfo>, updatedFaceLinks: Map<number, string>, updatedAttendance: AttendanceRecord[]}> => {
    return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));
        
        const students = loadStudentDirectory();
        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];

        rollNumbers.forEach(rollNumber => {
            const student = students.get(rollNumber);
            if (!student) return; // Skip if student doesn't exist

            if (!highPrivilegeRoles.includes(admin.designation)) {
                if (admin.designation === Designation.HOD && student.department !== admin.department) {
                    // Skip this student if HOD is from another department
                    return; 
                } else if (admin.designation !== Designation.HOD) {
                    // Skip if not HOD or high privilege
                    return;
                }
            }
            // If checks pass, proceed with marking for deletion
            students.delete(rollNumber);
        });

        const links = loadFaceLinks();
        const attendance = loadAttendance();
        const pidsToDelete = new Set<number>();
        rollNumbers.forEach(rollNumber => {
             for (const [pid, rn] of links.entries()) {
                if (rn === rollNumber) {
                    pidsToDelete.add(pid);
                }
            }
        });

        pidsToDelete.forEach(pid => links.delete(pid));
        const newAttendance = attendance.filter(record => !pidsToDelete.has(record.persistentId));
        
        saveStudentDirectory(students);
        saveFaceLinks(links);
        saveAttendance(newAttendance);

        logAdminAction(adminId, 'Bulk Delete Students', `Attempted to delete ${rollNumbers.length} students.`);
        resolve({ updatedStudents: students, updatedFaceLinks: links, updatedAttendance: newAttendance });
    });
};


export const blockStudent = (rollNumber: string, adminId: string, durationMs: number | 'PERMANENT'): Promise<StudentInfo> => {
    return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));

        const students = loadStudentDirectory();
        const student = students.get(rollNumber);
        if (!student) return reject(new Error("Student not found"));

        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
        if (!highPrivilegeRoles.includes(admin.designation)) {
            if (admin.designation === Designation.HOD && student.department !== admin.department) {
                return reject(new Error("HODs can only manage students in their own department."));
            } else if (admin.designation !== Designation.HOD) {
                return reject(new Error("You do not have permission to block students."));
            }
        }
       
        const newExpiry = durationMs === 'PERMANENT' ? Infinity : Date.now() + durationMs;
        const updatedStudent: StudentInfo = { ...student, blockExpiresAt: newExpiry, blockedBy: adminId };
        students.set(rollNumber, updatedStudent);
        saveStudentDirectory(students);
       
        const durationText = durationMs === 'PERMANENT' ? 'permanently' : `for ${durationMs / 1000 / 60} minutes`;
        logAdminAction(adminId, 'Block Student', `Blocked student ${rollNumber} ${durationText}`);
        resolve(updatedStudent);
    });
};

export const blockStudents = (rollNumbers: string[], adminId: string, durationMs: number | 'PERMANENT'): Promise<Map<string, StudentInfo>> => {
    return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));

        const students = loadStudentDirectory();
        const newExpiry = durationMs === 'PERMANENT' ? Infinity : Date.now() + durationMs;
        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];

        rollNumbers.forEach(rollNumber => {
            const student = students.get(rollNumber);
            if (!student) return;

             if (!highPrivilegeRoles.includes(admin.designation)) {
                if (admin.designation === Designation.HOD && student.department !== admin.department) {
                    return; 
                } else if (admin.designation !== Designation.HOD) {
                    return;
                }
            }

            student.blockExpiresAt = newExpiry;
            student.blockedBy = adminId;
            students.set(rollNumber, student);
        });

        saveStudentDirectory(students);
        const durationText = durationMs === 'PERMANENT' ? 'permanently' : `for ${durationMs / 1000 / 60} minutes`;
        logAdminAction(adminId, 'Bulk Block Students', `Blocked ${rollNumbers.length} students ${durationText}`);
        resolve(students);
    });
};


export const unblockStudent = (rollNumber: string, adminId: string): Promise<StudentInfo> => {
    return new Promise((resolve, reject) => {
       const admins = loadAdminDirectory();
       const admin = admins.get(adminId);
       if (!admin) return reject(new Error("Admin performing action not found."));

       const students = loadStudentDirectory();
       const student = students.get(rollNumber);
       if (!student) return reject(new Error("Student not found"));

        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
        if (!highPrivilegeRoles.includes(admin.designation)) {
            if (admin.designation === Designation.HOD && student.department !== admin.department) {
                return reject(new Error("HODs can only manage students in their own department."));
            } else if (admin.designation !== Designation.HOD) {
                return reject(new Error("You do not have permission to unblock students."));
            }
        }
       
       const updatedStudent: StudentInfo = { ...student, blockExpiresAt: null, blockedBy: null };
       students.set(rollNumber, updatedStudent);
       saveStudentDirectory(students);
       
       const adminName = admin.name || 'an Administrator';
       sendUnblockNotificationEmail(student.email, adminName, false);

       logAdminAction(adminId, 'Unblock Student', `Unblocked student ${rollNumber}`);
       resolve(updatedStudent);
    });
};

export const unblockStudents = (rollNumbers: string[], adminId: string): Promise<Map<string, StudentInfo>> => {
    return new Promise((resolve, reject) => {
       const admins = loadAdminDirectory();
       const admin = admins.get(adminId);
       if (!admin) return reject(new Error("Admin performing action not found."));

       const students = loadStudentDirectory();
       const adminName = admin.name || 'an Administrator';
       const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
       
       rollNumbers.forEach(rollNumber => {
            const student = students.get(rollNumber);
            if (!student) return;

             if (!highPrivilegeRoles.includes(admin.designation)) {
                if (admin.designation === Designation.HOD && student.department !== admin.department) {
                    return; 
                } else if (admin.designation !== Designation.HOD) {
                    return;
                }
            }

            student.blockExpiresAt = null;
            student.blockedBy = null;
            students.set(rollNumber, student);
            sendUnblockNotificationEmail(student.email, adminName, false);
       });
       
       saveStudentDirectory(students);
       logAdminAction(adminId, 'Bulk Unblock Students', `Unblocked ${rollNumbers.length} students`);
       resolve(students);
    });
};


export const deleteAdmin = (idNumber: string, adminId: string): Promise<Map<string, AdminInfo>> => {
    return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));
        
        const adminToDelete = admins.get(idNumber);
        if (!adminToDelete) return reject(new Error("Admin to be deleted not found."));
        
        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];

        if (highPrivilegeRoles.includes(admin.designation)) {
            if ([Designation.Principal, Designation.Chairman].includes(adminToDelete.designation)) {
                return reject(new Error("This role cannot be deleted."));
            }
        } else {
            return reject(new Error("You do not have permission to delete admin accounts."));
        }

        admins.delete(idNumber);
        saveAdminDirectory(admins);
        logAdminAction(adminId, 'Delete Admin', `Deleted admin with ID Number: ${idNumber}`);
        resolve(admins);
    });
};

export const deleteAdmins = (idNumbers: string[], adminId: string): Promise<Map<string, AdminInfo>> => {
    return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));

        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
        let deletedCount = 0;
        
        idNumbers.forEach(idNumber => {
            const adminToDelete = admins.get(idNumber);
            if (!adminToDelete) return;

            let canDelete = false;
            if (highPrivilegeRoles.includes(admin.designation)) {
                if (![Designation.Principal, Designation.Chairman].includes(adminToDelete.designation)) {
                    canDelete = true;
                }
            }
            
            if (canDelete) {
                admins.delete(idNumber);
                deletedCount++;
            }
        });

        saveAdminDirectory(admins);
        logAdminAction(adminId, 'Bulk Delete Admins', `Deleted ${deletedCount} of ${idNumbers.length} selected admins.`);
        resolve(admins);
    });
};


export const toggleAdminBlock = (idNumber: string, adminId: string): Promise<AdminInfo> => {
     return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));

        const adminToToggle = admins.get(idNumber);
        if (!adminToToggle) return reject(new Error("Admin to be toggled not found."));

        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
        
        if (highPrivilegeRoles.includes(admin.designation)) {
            if ([Designation.Principal, Designation.Chairman].includes(adminToToggle.designation)) {
                return reject(new Error("This role's block status cannot be changed."));
            }
        } else {
            return reject(new Error("You do not have permission to block admin accounts."));
        }

        const updatedAdmin = { ...adminToToggle, isBlocked: !adminToToggle.isBlocked };
        admins.set(idNumber, updatedAdmin);
        saveAdminDirectory(admins);
        const action = updatedAdmin.isBlocked ? 'Block Admin' : 'Unblock Admin';
        logAdminAction(adminId, action, `Target ID Number: ${idNumber}`);
        resolve(updatedAdmin);
     });
};

export const toggleAdminsBlock = (idNumbers: string[], adminId: string, block: boolean): Promise<Map<string, AdminInfo>> => {
     return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));

        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
        let toggledCount = 0;
        
        idNumbers.forEach(idNumber => {
            const adminToToggle = admins.get(idNumber);
            if (!adminToToggle) return;

            let canToggle = false;
            if (highPrivilegeRoles.includes(admin.designation)) {
                if (![Designation.Principal, Designation.Chairman].includes(adminToToggle.designation)) {
                    canToggle = true;
                }
            }
            
            if (canToggle) {
                adminToToggle.isBlocked = block;
                admins.set(idNumber, adminToToggle);
                toggledCount++;
            }
        });
        
        saveAdminDirectory(admins);
        const action = block ? 'Bulk Block Admins' : 'Bulk Unblock Admins';
        logAdminAction(adminId, action, `Toggled block status for ${toggledCount} of ${idNumbers.length} selected admins.`);
        resolve(admins);
     });
};


export const toggleAdminPresence = (idNumber: string, adminId: string): Promise<{ updatedAdmin: AdminInfo; updatedTimeTable: TimeTableEntry[] }> => {
    return new Promise((resolve, reject) => {
        const admins = loadAdminDirectory();
        const admin = admins.get(adminId);
        if (!admin) return reject(new Error("Admin performing action not found."));

        const adminToToggle = admins.get(idNumber);
        if (!adminToToggle) return reject(new Error("Admin to toggle not found"));

        // Permissions
        const highPrivilegeRoles = [Designation.Chairman, Designation.Principal, Designation.VicePrincipal];
        if (!highPrivilegeRoles.includes(admin.designation)) {
             if (admin.designation === Designation.HOD) {
                 if (adminToToggle.department !== admin.department) {
                     return reject(new Error("HODs can only change presence for staff in their department."));
                 }
             } else if (admin.idNumber !== idNumber) { // Teachers/Incharges can only change their own presence
                 return reject(new Error("You can only change your own presence status."));
             }
        }
        
        if (adminToToggle.designation === Designation.Chairman) {
            return reject(new Error("Chairman presence cannot be changed."));
        }

        const updatedAdmin = { ...adminToToggle, isPresentToday: !(adminToToggle.isPresentToday ?? true) };
        admins.set(idNumber, updatedAdmin);
        saveAdminDirectory(admins);
        
        const action = updatedAdmin.isPresentToday ? 'Mark Present' : 'Mark Unavailable';
        logAdminAction(adminId, 'Toggle Presence', `${action} for ${adminToToggle.name} (${idNumber})`);
        
        // Update timetable based on presence
        const timeTable = loadTimeTable();
        const now = new Date();
        const dayOfWeek = now.getDay();
        const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

        const updatedTimeTable = timeTable.map(entry => {
            if (entry.teacherId === idNumber && entry.dayOfWeek === adjustedDay) {
                return { ...entry, isAbsent: !updatedAdmin.isPresentToday };
            }
            return entry;
        });
        saveTimeTable(updatedTimeTable);

        resolve({ updatedAdmin, updatedTimeTable });
    });
};

export const resetAdminPresenceOnLogin = (adminId: string): Promise<{ updatedAdmin: AdminInfo; updatedTimeTable: TimeTableEntry[] }> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const admins = loadAdminDirectory();
            const admin = admins.get(adminId);
            if (!admin) {
                return reject(new Error("Admin not found during presence reset."));
            }

            // Only update if they are currently marked as unavailable
            if (admin.isPresentToday === false) {
                admin.isPresentToday = true;
                admins.set(adminId, admin);
                saveAdminDirectory(admins);

                const timeTable = loadTimeTable();
                const now = new Date();
                const dayOfWeek = now.getDay();
                const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

                const updatedTimeTable = timeTable.map(entry => {
                    if (entry.teacherId === adminId && entry.dayOfWeek === adjustedDay) {
                        return { ...entry, isAbsent: false };
                    }
                    return entry;
                });
                saveTimeTable(updatedTimeTable);
                resolve({ updatedAdmin: admin, updatedTimeTable });
            } else {
                // If already present, no changes needed, return current state
                resolve({ updatedAdmin: admin, updatedTimeTable: loadTimeTable() });
            }
        }, API_LATENCY / 2); // Faster, as it's part of login flow
    });
};

export const deleteSelf = (identifier: string, userType: 'STUDENT' | 'ADMIN', password: string): Promise<{
    updatedStudents: Map<string, StudentInfo>,
    updatedAdmins: Map<string, AdminInfo>,
    updatedFaceLinks: Map<number, string>,
    updatedAttendance: AttendanceRecord[]
}> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const students = loadStudentDirectory();
            const admins = loadAdminDirectory();
            const links = loadFaceLinks();
            const attendance = loadAttendance();

            let persistentIdToDelete: number | null = null;

            if (userType === 'STUDENT') {
                const student = students.get(identifier);
                if (!student) return reject(new Error("User not found."));
                if (student.password !== password) return reject(new Error("Incorrect password."));
                
                for (const [pid, rn] of links.entries()) {
                    if (rn === identifier) {
                        persistentIdToDelete = pid;
                        break;
                    }
                }
                students.delete(identifier);
            } else { // userType === 'ADMIN'
                const admin = admins.get(identifier);
                if (!admin) return reject(new Error("User not found."));
                if (admin.password !== password) return reject(new Error("Incorrect password."));
                if (admin.designation === Designation.Principal) return reject(new Error("Principal account cannot be deleted."));
                
                admins.delete(identifier);
            }

            // Clean up related data
            if (persistentIdToDelete !== null) {
                links.delete(persistentIdToDelete);
            }
            const newAttendance = attendance.filter(record => record.persistentId !== persistentIdToDelete);
            
            // Save all changes
            saveStudentDirectory(students);
            saveAdminDirectory(admins);
            saveFaceLinks(links);
            saveAttendance(newAttendance);

            resolve({
                updatedStudents: students,
                updatedAdmins: admins,
                updatedFaceLinks: links,
                updatedAttendance: newAttendance
            });
        }, API_LATENCY);
    });
};


export const addDepartment = (name: string): Promise<string[]> => {
    return new Promise(resolve => {
        const depts = loadDepartments();
        if (!depts.includes(name)) {
            depts.push(name);
            saveDepartments(depts);
        }
        resolve(depts);
    });
};

export const logAttendance = (persistentId: number, emotion: Emotion, subject?: string): Promise<AttendanceRecord[]> => {
    return new Promise(resolve => {
        const attendance = loadAttendance();
        const newRecord: AttendanceRecord = { 
            id: crypto.randomUUID(),
            persistentId, 
            timestamp: Date.now(), 
            emotion, 
            subject,
            status: 'present',
            source: 'AI'
        };
        const newAttendance = [...attendance, newRecord];
        saveAttendance(newAttendance);
        resolve(newAttendance);
    });
};

export const setManualAttendance = (studentRollNumber: string, subject: string, date: Date, status: 'present' | 'absent', adminId: string): Promise<AttendanceRecord[]> => {
    return new Promise((resolve, reject) => {
        const attendance = loadAttendance();
        const faceLinks = loadFaceLinks();
        let persistentId: number | undefined;

        // Find existing persistentId
        for (const [pid, roll] of faceLinks.entries()) {
            if (roll === studentRollNumber) {
                persistentId = pid;
                break;
            }
        }

        // If no persistentId exists, create a new one for this student
        if (persistentId === undefined) {
            const students = loadStudentDirectory();
            if (!students.has(studentRollNumber)) {
                return reject(new Error(`Student with roll number ${studentRollNumber} not found.`));
            }
            
            const existingIds = Array.from(faceLinks.keys());
            const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
            persistentId = newId; // Make sure to assign it here
            faceLinks.set(newId, studentRollNumber);
            saveFaceLinks(faceLinks);
            logAdminAction(adminId, 'Auto-Link Student', `Created a link for ${studentRollNumber} during manual attendance marking.`);
        }

        // A manual record overrides any other record for the same day and subject
        const newRecord: AttendanceRecord = {
            id: crypto.randomUUID(),
            persistentId,
            timestamp: date.getTime(),
            emotion: Emotion.Neutral, // Default emotion for manual entry
            subject,
            status,
            source: 'Manual',
            markedBy: adminId
        };

        const newAttendance = [...attendance, newRecord];
        saveAttendance(newAttendance);
        logAdminAction(adminId, 'Manual Attendance', `Marked ${studentRollNumber} as ${status} for ${subject}.`);
        resolve(newAttendance);
    });
};

export const saveTimeTableEntries = (entries: TimeTableEntry[], adminId: string): Promise<TimeTableEntry[]> => {
    return new Promise(resolve => {
        setTimeout(() => {
            saveTimeTable(entries);
            logAdminAction(adminId, 'Update Timetable', `Updated the weekly timetable.`);
            resolve(entries);
        }, API_LATENCY);
    });
};

export const updateTimeTableEntry = (updatedEntry: TimeTableEntry, adminId: string): Promise<TimeTableEntry[]> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const timetable = loadTimeTable();
            const entryIndex = timetable.findIndex(e => e.id === updatedEntry.id);
            if (entryIndex === -1) {
                return reject(new Error("Timetable entry not found."));
            }
            
            timetable[entryIndex] = updatedEntry;
            saveTimeTable(timetable);

            const { subject, department, year, section, isAbsent, teacherId } = updatedEntry;
            const details = `Updated class: ${subject} (${department}/${year}/Sec${section}). Status: ${isAbsent ? 'Teacher Absent' : `Teacher ID ${teacherId}`}.`;
            logAdminAction(adminId, 'Update Timetable Entry', details);

            resolve(timetable);
        }, API_LATENCY);
    });
};


/**
 * Logs a generic administrator action. This is a fire-and-forget action
 * used for auditing non-data-mutation events like viewing or downloading reports.
 * @param adminId The ID of the administrator performing the action.
 * @param action A short description of the action type.
 * @param details Specific details about the action.
 */
export const logGenericAdminAction = (adminId: string, action: string, details: string): void => {
    logAdminAction(adminId, action, details);
};

export const requestLeave = (
    teacherId: string,
    startDate: string,
    endDate: string,
    reason: string
): Promise<LeaveRecord[]> => {
    return new Promise((resolve) => {
        const leaveRecords = loadLeaveRecords();
        const newRecord: LeaveRecord = {
            id: `leave-${Date.now()}`,
            teacherId,
            startDate,
            endDate,
            reason,
            status: 'Pending',
            requestedAt: Date.now(),
        };
        const updatedRecords = [...leaveRecords, newRecord];
        saveLeaveRecords(updatedRecords);
        resolve(updatedRecords);
    });
};

export const cancelOwnLeave = (leaveId: string, teacherId: string): Promise<LeaveRecord[]> => {
    return new Promise((resolve, reject) => {
        let leaveRecords = loadLeaveRecords();
        const record = leaveRecords.find(r => r.id === leaveId);
        if (!record) return reject(new Error("Leave record not found."));
        if (record.teacherId !== teacherId) return reject(new Error("You can only cancel your own leave requests."));
        if (record.status !== 'Pending') return reject(new Error("Only pending leave requests can be cancelled."));
        
        const updatedRecords = leaveRecords.filter(r => r.id !== leaveId);
        saveLeaveRecords(updatedRecords);
        resolve(updatedRecords);
    });
};

export const approveLeave = async (
    leaveId: string,
    adminId: string
): Promise<{ updatedLeaveRecords: LeaveRecord[]; updatedTimeTable: TimeTableEntry[] }> => {
    let leaveRecords = loadLeaveRecords();
    const recordIndex = leaveRecords.findIndex(r => r.id === leaveId);
    if (recordIndex === -1) throw new Error("Leave record not found.");
    const record = leaveRecords[recordIndex];
    if (record.status !== 'Pending') throw new Error("This leave request has already been reviewed.");

    record.status = 'Approved';
    record.reviewedBy = adminId;
    record.reviewedAt = Date.now();
    leaveRecords[recordIndex] = record;
    
    const timeTable = loadTimeTable();
    const admins = loadAdminDirectory();
    const teacherOnLeave = admins.get(record.teacherId);
    if (!teacherOnLeave) throw new Error("Teacher not found.");

    const startDate = new Date(record.startDate + 'T00:00:00');
    const endDate = new Date(record.endDate + 'T23:59:59');
    let currentDay = new Date(startDate);
    const updatedTimeTable = [...timeTable];

    while (currentDay <= endDate) {
        const dayOfWeek = currentDay.getDay();
        const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
        const classesToCover = timeTable.filter(e => e.teacherId === record.teacherId && e.dayOfWeek === adjustedDay);

        for (const classToCover of classesToCover) {
            try {
                const suggestion = await suggestSubstituteTeacher(classToCover, Array.from(admins.values()), timeTable);
                const classIndex = updatedTimeTable.findIndex(e => e.id === classToCover.id);
                if (classIndex !== -1) {
                    if (suggestion) {
                        updatedTimeTable[classIndex].teacherId = suggestion.suggestedTeacherId;
                        logAdminAction(adminId, 'AI Substitute Assignment', `Assigned ${suggestion.suggestedTeacherId} to cover ${classToCover.subject} for ${record.teacherId}. Reason: ${suggestion.reason}`);
                    } else {
                        updatedTimeTable[classIndex].isAbsent = true;
                        logAdminAction(adminId, 'AI Substitute Assignment', `Could not find substitute for ${classToCover.subject}. Marked teacher as absent.`);
                    }
                }
            } catch (err) {
                console.error(`AI suggestion failed for class ${classToCover.id}`, err);
                const classIndex = updatedTimeTable.findIndex(e => e.id === classToCover.id);
                 if (classIndex !== -1) {
                    updatedTimeTable[classIndex].isAbsent = true;
                }
            }
        }
        currentDay.setDate(currentDay.getDate() + 1);
    }
    
    saveLeaveRecords(leaveRecords);
    saveTimeTable(updatedTimeTable);
    
    const hod = Array.from(admins.values()).find(a => a.designation === Designation.HOD && a.department === teacherOnLeave.department);
    if (hod && hod.idNumber !== record.teacherId) {
        await sendLeaveNotificationEmail(hod.email, teacherOnLeave.name, record.startDate, record.endDate);
    }
    await sendLeaveStatusNotificationEmail(teacherOnLeave.email, teacherOnLeave.name, record.startDate, record.endDate, 'Approved');

    logAdminAction(adminId, 'Approve Leave', `Approved leave for ${teacherOnLeave.name} (${record.teacherId}) from ${record.startDate} to ${record.endDate}.`);

    return { updatedLeaveRecords: leaveRecords, updatedTimeTable };
};

export const rejectLeave = (leaveId: string, adminId: string): Promise<LeaveRecord[]> => {
    return new Promise(async (resolve, reject) => {
        let leaveRecords = loadLeaveRecords();
        const recordIndex = leaveRecords.findIndex(r => r.id === leaveId);
        if (recordIndex === -1) return reject(new Error("Leave record not found."));
        const record = leaveRecords[recordIndex];
        if (record.status !== 'Pending') return reject(new Error("This leave request has already been reviewed."));

        record.status = 'Rejected';
        record.reviewedBy = adminId;
        record.reviewedAt = Date.now();
        leaveRecords[recordIndex] = record;
        saveLeaveRecords(leaveRecords);

        const admins = loadAdminDirectory();
        const teacher = admins.get(record.teacherId);
        if(teacher) {
            await sendLeaveStatusNotificationEmail(teacher.email, teacher.name, record.startDate, record.endDate, 'Rejected');
            logAdminAction(adminId, 'Reject Leave', `Rejected leave for ${teacher.name} (${record.teacherId}).`);
        }

        resolve(leaveRecords);
    });
};

export const grantHoliday = async (
    startDateStr: string,
    endDateStr: string,
    reason: string,
    adminId: string
): Promise<{ updatedHolidays: Holiday[]; updatedTimeTable: TimeTableEntry[] }> => {
    return new Promise(async (resolve, reject) => {
        const holidays = loadHolidays();
        const timeTable = loadTimeTable();
        const admins = loadAdminDirectory();

        // Check for overlapping holidays
        const newStart = new Date(startDateStr).getTime();
        const newEnd = new Date(endDateStr).getTime();
        const overlap = holidays.some(h => {
            const existingStart = new Date(h.startDate).getTime();
            const existingEnd = new Date(h.endDate).getTime();
            return Math.max(newStart, existingStart) <= Math.min(newEnd, existingEnd);
        });
        if (overlap) {
            return reject(new Error("The selected date range overlaps with an existing holiday."));
        }

        const newHoliday: Holiday = {
            id: `holiday-${Date.now()}`,
            startDate: startDateStr,
            endDate: endDateStr,
            reason,
            grantedBy: adminId,
        };
        holidays.push(newHoliday);
        saveHolidays(holidays);

        let rescheduledCount = 0;
        let cancelledCount = 0;
        const updatedTimeTable = [...timeTable];
        
        let currentDate = new Date(startDateStr + 'T00:00:00');
        const endDate = new Date(endDateStr + 'T00:00:00');

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

            const affectedEntries = updatedTimeTable.filter(e => e.dayOfWeek === adjustedDay && !e.isCancelled);

            for (const entry of affectedEntries) {
                const entryIndex = updatedTimeTable.findIndex(e => e.id === entry.id);
                if (entryIndex === -1) continue;

                updatedTimeTable[entryIndex].isCancelled = true;
                updatedTimeTable[entryIndex].cancellationReason = `Holiday: ${reason}`;
                cancelledCount++;

                const rescheduleSuggestion = await rescheduleClass(entry, updatedTimeTable, Array.from(admins.values()), holidays, currentDate);

                if (rescheduleSuggestion) {
                    const rescheduleDate = new Date(rescheduleSuggestion.newDate + 'T00:00:00');
                    const newDayOfWeek = rescheduleDate.getDay();
                    const newAdjustedDay = newDayOfWeek === 0 ? 7 : newDayOfWeek;

                    const newEntry: TimeTableEntry = {
                        ...entry, // copy original
                        id: `rescheduled-${entry.id}-${Date.now()}`,
                        dayOfWeek: newAdjustedDay,
                        startTime: rescheduleSuggestion.newStartTime,
                        endTime: `${String(parseInt(rescheduleSuggestion.newStartTime.split(':')[0]) + 1).padStart(2, '0')}:00`,
                        isCancelled: false,
                        cancellationReason: undefined,
                        rescheduledFrom: entry.id,
                    };
                    updatedTimeTable.push(newEntry);
                    rescheduledCount++;
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        saveTimeTable(updatedTimeTable);
        logAdminAction(adminId, 'Grant Holiday', `Granted holiday: ${reason}. Cancelled: ${cancelledCount}, Rescheduled: ${rescheduledCount}.`);

        // Send notification email to HODs
        const hods = Array.from(admins.values()).filter(a => a.designation === Designation.HOD);
        const summary = `Total classes cancelled: ${cancelledCount}. AI successfully rescheduled: ${rescheduledCount}.`;
        hods.forEach(hod => {
            sendHolidayNotificationEmail(hod.email, startDateStr, endDateStr, reason, summary);
        });

        resolve({ updatedHolidays: holidays, updatedTimeTable });
    });
};

export const getConversations = (
    userId: string,
    userType: 'STUDENT' | 'ADMIN',
    designation?: Designation,
    department?: string
): Promise<Conversation[]> => {
    return new Promise(resolve => {
        const allConversations = loadConversations();
        
        if (userType === 'STUDENT') {
            resolve(allConversations.filter(c => c.participantIds.includes(userId)));
            return;
        }

        if (userType === 'ADMIN') {
            if (designation === Designation.Chairman || designation === Designation.Principal) {
                resolve(allConversations); // See all
                return;
            }

            // Default for other admins (e.g., teachers, incharges, HODs): only see their own conversations
            resolve(allConversations.filter(c => c.participantIds.includes(userId)));
        }
    });
};

export const cancelHoliday = (
    holidayId: string,
    adminId: string
): Promise<{ updatedHolidays: Holiday[]; updatedTimeTable: TimeTableEntry[] }> => {
    return new Promise((resolve, reject) => {
        let holidays = loadHolidays();
        const holidayToCancel = holidays.find(h => h.id === holidayId);
        if (!holidayToCancel) {
            return reject(new Error("Holiday not found."));
        }

        holidays = holidays.filter(h => h.id !== holidayId);
        saveHolidays(holidays);

        const timeTable = loadTimeTable();
        const updatedTimeTable = timeTable.map(entry => {
            if (entry.isCancelled && entry.cancellationReason === `Holiday: ${holidayToCancel.reason}`) {
                const { isCancelled, cancellationReason, ...rest } = entry;
                return rest as TimeTableEntry;
            }
            return entry;
        });
        
        saveTimeTable(updatedTimeTable);
        logAdminAction(adminId, 'Cancel Holiday', `Cancelled holiday: ${holidayToCancel.reason} from ${holidayToCancel.startDate} to ${holidayToCancel.endDate}`);
        
        resolve({ updatedHolidays: holidays, updatedTimeTable });
    });
};

export const sendMessage = (senderId: string, receiverId: string, content: string): Promise<Conversation[]> => {
    return new Promise(resolve => {
        const conversations = loadConversations();
        const sortedParticipantIds = [senderId, receiverId].sort();
        const conversationId = sortedParticipantIds.join('_');

        const newMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            senderId,
            timestamp: Date.now(),
            content,
        };

        const existingConvoIndex = conversations.findIndex(c => c.id === conversationId);

        if (existingConvoIndex > -1) {
            conversations[existingConvoIndex].messages.push(newMessage);
            conversations[existingConvoIndex].lastUpdate = Date.now();
        } else {
            const newConversation: Conversation = {
                id: conversationId,
                participantIds: [sortedParticipantIds[0], sortedParticipantIds[1]],
                messages: [newMessage],
                lastUpdate: Date.now(),
            };
            conversations.push(newConversation);
        }

        saveConversations(conversations);
        resolve(conversations);
    });
};

// --- Community Features ---

export const createStudyGroup = (
    groupData: Omit<StudyGroup, 'id' | 'events' | 'messages'>
): Promise<{ newGroup: StudyGroup; updatedStudents: Map<string, StudentInfo> }> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const groups = loadStudyGroups();
            const students = loadStudentDirectory();
            
            const newGroup: StudyGroup = {
                ...groupData,
                id: `group-${Date.now()}`,
                events: [],
                messages: [],
            };
            groups.push(newGroup);

            const creator = students.get(groupData.createdBy);
            if (!creator) {
                return reject(new Error('Creator of the study group not found.'));
            }
            if (!creator.studyGroupIds) {
                creator.studyGroupIds = [];
            }
            creator.studyGroupIds.push(newGroup.id);
            students.set(creator.rollNumber, creator);

            saveStudyGroups(groups);
            saveStudentDirectory(students);
            
            resolve({ newGroup, updatedStudents: students });
        }, API_LATENCY);
    });
};

export const joinStudyGroup = (
    groupId: string,
    studentId: string
): Promise<{ updatedGroup: StudyGroup; updatedStudent: StudentInfo }> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const groups = loadStudyGroups();
            const students = loadStudentDirectory();

            const group = groups.find(g => g.id === groupId);
            const student = students.get(studentId);

            if (!group) return reject(new Error('Study group not found.'));
            if (!student) return reject(new Error('Student not found.'));

            if (group.members.length >= group.maxSize) {
                return reject(new Error('Study group is already full.'));
            }
            if (group.members.includes(studentId)) {
                return reject(new Error('You are already a member of this group.'));
            }

            group.members.push(studentId);
            if (!student.studyGroupIds) {
                student.studyGroupIds = [];
            }
            student.studyGroupIds.push(groupId);

            students.set(studentId, student);
            saveStudyGroups(groups);
            saveStudentDirectory(students);

            resolve({ updatedGroup: group, updatedStudent: student });
        }, API_LATENCY);
    });
};

export const sendGroupMessage = (
    groupId: string,
    senderId: string,
    content: string,
    file?: { name: string; url: string }
): Promise<StudyGroup> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const groups = loadStudyGroups();
            const groupIndex = groups.findIndex(g => g.id === groupId);

            if (groupIndex === -1) {
                return reject(new Error('Study group not found.'));
            }

            const group = groups[groupIndex];
            if (!group.members.includes(senderId)) {
                return reject(new Error('You are not a member of this group.'));
            }
            
            const newMessage: GroupChatMessage = {
                id: `msg-${Date.now()}`,
                senderId,
                timestamp: Date.now(),
                content,
                file,
            };

            group.messages.push(newMessage);
            groups[groupIndex] = group;

            saveStudyGroups(groups);
            resolve(group);
        }, API_LATENCY / 2); // Faster for chat
    });
};

export const uploadNote = (
    noteData: Omit<SharedNote, 'id' | 'ratings' | 'createdAt'>
): Promise<SharedNote> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            const notes = loadSharedNotes();
            const newNote: SharedNote = {
                ...noteData,
                id: `note-${Date.now()}`,
                ratings: [],
                createdAt: Date.now(),
            };
            notes.unshift(newNote); // Add to the top of the list
            saveSharedNotes(notes);
            resolve(newNote);
        }, API_LATENCY);
    });
};

export const rateNote = (
    noteId: string,
    rating: number,
    raterId: string
): Promise<SharedNote> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const notes = loadSharedNotes();
            const noteIndex = notes.findIndex(n => n.id === noteId);

            if (noteIndex === -1) {
                return reject(new Error('Note not found.'));
            }

            const note = notes[noteIndex];
            const existingRatingIndex = note.ratings.findIndex(r => r.raterId === raterId);
            
            if (existingRatingIndex > -1) {
                note.ratings[existingRatingIndex].rating = rating;
            } else {
                note.ratings.push({ raterId, rating });
            }

            notes[noteIndex] = note;
            saveSharedNotes(notes);
            resolve(note);
        }, API_LATENCY);
    });
};

export const suggestStudyTime = async (groupId: string): Promise<{ dayOfWeek: number, startTime: string, reason: string }[]> => {
    const groups = loadStudyGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) throw new Error("Study group not found.");

    const students = loadStudentDirectory();
    const timeTable = loadTimeTable();
    const holidays = loadHolidays();

    const memberTimetables = group.members.map(memberId => {
        const student = students.get(memberId);
        if (!student) return { memberId, schedule: [] };
        
        const schedule = timeTable.filter(e => 
            e.department === student.department &&
            e.year === student.year &&
            e.section === student.section
        );
        return { memberId, schedule };
    });

    const { suggestions } = await geminiSuggestStudyTime(memberTimetables, holidays);
    return suggestions;
};


export const summarizeNote = async (noteId: string): Promise<string> => {
    const notes = loadSharedNotes();
    const note = notes.find(n => n.id === noteId);
    if (!note) throw new Error("Note not found.");
    
    // Expecting data:text/plain;base64,....
    const base64Data = note.fileDataUrl.split(',')[1];
    if (!base64Data) throw new Error("Note content is empty or in an unsupported format.");

    try {
        const noteContent = base64ToUtf8(base64Data);
        const { summary } = await geminiSummarizeNote(noteContent);
        return summary;
    } catch (e) {
        console.error("Error decoding or summarizing note", e);
        throw new Error("Could not summarize this note. It may not be a plain text file.");
    }
};

// --- AI Insights ---

export const getAttendanceAnomalies = async (
    studentsToAnalyze: StudentInfo[],
    allAttendance: AttendanceRecord[],
    faceLinks: Map<number, string>
): Promise<AttendanceAnomaly[]> => {
    try {
        const studentIdToPid = new Map<string, number>();
        for (const [pid, roll] of faceLinks.entries()) {
            studentIdToPid.set(roll, pid);
        }

        const contextLines: string[] = [];

        studentsToAnalyze.forEach(student => {
            contextLines.push(`--- Student: ${student.name} (Roll: ${student.rollNumber}) ---`);
            const pid = studentIdToPid.get(student.rollNumber);
            if (pid === undefined) {
                contextLines.push("Attendance Data: No face link found for this student.");
            } else {
                const studentAttendance = allAttendance.filter(rec => rec.persistentId === pid);
                if (studentAttendance.length === 0) {
                    contextLines.push("Attendance Data: No attendance records found.");
                } else {
                    contextLines.push("Recent Attendance Records (timestamp, subject, emotion):");
                    // Provide last 20 records for recency analysis
                    studentAttendance
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .slice(0, 20)
                        .forEach(rec => {
                            contextLines.push(`- ${new Date(rec.timestamp).toISOString()}: ${rec.subject || 'General'}, Emotion: ${rec.emotion}`);
                        });
                }
            }
            contextLines.push("\n");
        });
        
        const context = contextLines.join('\n');
        if (!context.trim()) {
            return [];
        }

        const { anomalies } = await analyzeAttendanceAnomalies(context);
        return anomalies;
    } catch (error) {
        console.error("Error analyzing attendance anomalies in API service:", error);
        throw error;
    }
};
