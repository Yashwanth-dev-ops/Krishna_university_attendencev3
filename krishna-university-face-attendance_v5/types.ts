export enum Emotion {
    Happy = 'Happy',
    Sad = 'Sad',
    Angry = 'Angry',
    Surprised = 'Surprised',
    Neutral = 'Neutral',
    Disgusted = 'Disgusted',
    Fearful = 'Fearful',
}

export enum HandSign {
    ThumbsUp = 'Thumbs Up',
    ThumbsDown = 'Thumbs Down',
    Peace = 'Peace',
    OK = 'OK',
    Fist = 'Fist',
    Wave = 'Wave',
    Pointing = 'Pointing',
    HighFive = 'High Five',
    CallMe = 'Call Me',
    CrossedFingers = 'Crossed Fingers',
    Love = 'Love',
}

export enum Year {
    First = '1st Year',
    Second = '2nd Year',
    Third = '3rd Year',
    Fourth = '4th Year',
}

export enum Designation {
    Chairman = 'Chairman',
    Principal = 'Principal',
    VicePrincipal = 'Vice Principal',
    HOD = 'HOD',
    Incharge = 'Incharge',
    Teacher = 'Teacher',
}

export enum HeadPose {
    LookingStraight = 'Looking Straight',
    LookingLeft = 'Looking Left',
    LookingRight = 'Looking Right',
    LookingUp = 'Looking Up',
    LookingDown = 'Looking Down',
}

export type Theme = 'light' | 'dark';

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Fix: Add MediaSettingsRange interface for camera focus capabilities.
export interface MediaSettingsRange {
    max: number;
    min: number;
    step: number;
}

export interface MidTermMarks {
    subject: string;
    mid1: number | null;
    mid2: number | null;
}

// Fix: Add MarkPrediction interface to define the shape of student mark predictions.
export interface MarkPrediction {
    subject: string;
    mid1_prediction: number | null;
    mid2_prediction: number | null;
    mid1_reward_claimed?: boolean;
    mid2_reward_claimed?: boolean;
}

export interface StudentInfo {
    name: string;
    rollNumber: string; // Will be used as username
    department: string;
    year: Year;
    email: string;
    password: string; // In a real app, this would be a hash
    blockExpiresAt: number | null; // null = not blocked, timestamp = temp block, Infinity = permanent
    blockedBy: string | null; // Admin ID of the person who blocked them
    isVerified: boolean;
    onboarded: boolean;
    photoBase64?: string;
    marks?: MidTermMarks[];
    // Fix: Add optional predictions property to support the MarkPredictionPanel component.
    predictions?: MarkPrediction[];
    section: string;
    phoneNumber: string;
    studyGroupIds?: string[];
}

export interface AdminInfo {
    name: string;
    idNumber: string; // Will be used as username
    phoneNumber: string;
    department: string;
    email: string;
    designation: Designation;
    password: string; // In a real app, this would be a hash
    isBlocked?: boolean;
    isPresentToday?: boolean;
    isVerified: boolean;
    photoBase64?: string;
    section?: string; // For incharges
    year?: Year; // For incharges
}

export interface AttendanceRecord {
    id: string; // Unique ID for each record
    persistentId: number;
    timestamp: number;
    emotion: Emotion;
    subject?: string;
    status: 'present' | 'absent';
    source: 'AI' | 'Manual';
    markedBy?: string; // Admin ID who marked it
}

export interface TimeTableEntry {
    id: string; // e.g., 'monday-0900-CSE-1-1'
    dayOfWeek: number; // 1 for Monday, ..., 7 for Sunday
    startTime: string; // 'HH:MM'
    endTime: string; // 'HH:MM'
    subject: string;
    teacherId: string;
    department: string;
    year: Year;
    section: string;
    isAbsent?: boolean;
    isCancelled?: boolean;
    cancellationReason?: string;
    rescheduledFrom?: string; // original entry ID
}


export interface FaceResult {
    personId: string;
    emotion: Emotion;
    confidence: number;
    boundingBox: BoundingBox;
    headPose?: HeadPose;
    persistentId?: number;
    studentInfo?: StudentInfo;
}

export interface HandResult {
    sign: HandSign;
    confidence: number;
    boundingBox: BoundingBox;
}

export interface DetectionResult {
    faces: FaceResult[];
    hands: HandResult[];
}

export interface VerificationToken {
    identifier: string; // rollNumber or idNumber
    token: string;
    expiresAt: number;
}

export interface PasswordResetToken {
    identifier: string; // user's email
    token: string;
    expiresAt: number;
}

export interface SimulatedEmail {
    to: string;
    subject: string;
    body: string;
    token: string;
}

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRecord {
    id: string;
    teacherId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    reason: string;
    status: LeaveStatus;
    requestedAt: number; // timestamp
    reviewedBy?: string; // Admin ID
    reviewedAt?: number; // timestamp
}

export interface ChatMessage {
    id: string;
    senderId: string; // rollNumber or idNumber
    timestamp: number;
    content: string;
    isPriority?: boolean;
}

export interface Conversation {
    id: string; // e.g., 'studentRoll_teacherId'
    participantIds: [string, string]; // [studentRoll, teacherId]
    messages: ChatMessage[];
    lastUpdate: number;
}

export interface Holiday {
    id: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    reason: string;
    grantedBy: string; // Admin ID
}

// --- New Community Feature Types ---

export interface GroupChatMessage {
    id: string;
    senderId: string; // rollNumber
    timestamp: number;
    content: string;
    file?: { name: string; url: string };
    isPriority?: boolean;
}

export interface GroupEvent {
    id: string;
    title: string;
    startTime: number;
    endTime: number;
    location?: string; // Or a virtual meeting link
}

export interface StudyGroup {
    id: string;
    name: string;
    description: string;
    subject: string;
    department: string;
    year: Year;
    section?: string; // Optional: for section-specific groups
    members: string[]; // Array of student rollNumbers
    maxSize: number;
    createdBy: string; // rollNumber
    events: GroupEvent[];
    messages: GroupChatMessage[];
}

export interface NoteRating {
    raterId: string; // rollNumber
    rating: number; // 1-5
}

export interface SharedNote {
    id: string;
    uploaderId: string; // rollNumber
    subject: string;
    title: string;
    fileDataUrl: string; // Base64 Data URL for the file
    ratings: NoteRating[];
    createdAt: number;
}

// --- New AI Insights Feature Type ---

export interface AttendanceAnomaly {
    studentRollNumber: string;
    severity: 'High' | 'Medium' | 'Low';
    anomalyType: string;
    summary: string;
}