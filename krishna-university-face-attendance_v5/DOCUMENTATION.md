
# Krishna University Face Attendance - Developer Documentation

## 1. Project Overview

This document provides a comprehensive overview of the Krishna University Face Attendance system. It is a sophisticated, single-page web application designed to offer a modern solution for tracking student attendance in real-time.

### 1.1. Core Features

-   **Real-Time Face & Hand Detection:** Utilizes the device camera to continuously analyze video frames, detecting multiple faces and hand gestures simultaneously.
-   **AI-Powered Analysis:** Leverages the **Google Gemini API** to analyze captured frames for identity, emotion, and hand signs, returning structured JSON data.
-   **Persistent Face Tracking:** Implements a custom IoU (Intersection over Union) tracking algorithm to assign a stable `persistentId` to each detected person, even with momentary obstructions.
-   **Role-Based Access Control (RBAC):** Features distinct dashboards and permissions for different user roles:
    -   **Students:** Can view their attendance, marks, and mark themselves present via face capture.
    -   **Teachers:** Manage students in their department, enter marks, and run the live analyzer for their classes.
    -   **Incharges:** A teacher with administrative duties for a specific year/section.
    -   **HODs (Head of Department):** Administrative control over their entire department.
    -   **Principals/Vice-Principals:** Full administrative access across all departments.
-   **Comprehensive Student Management:** Admins can register students (individually or in bulk via CSV), view profiles, and manage account access with a nuanced blocking system (temporary and permanent blocks).
-   **Data Management & Reporting:** Includes features for mid-term mark assessment and downloading various reports (daily attendance, monthly summaries, student details) in CSV format.
-   **AI Assistant:** An integrated chat interface that allows admins to ask natural language questions about student data.
-   **Simulated Backend & Email:** The application is self-contained. It uses `localStorage` as its database (via `storageService.ts`) and features a mock inbox UI for simulated email-based account verification and notifications.

### 1.2. Technology Stack

-   **Frontend Framework:** React 19 (using hooks)
-   **Language:** TypeScript
-   **AI/ML:** Google Gemini API (`@google/genai`) for all vision and language tasks.
-   **Styling:** Tailwind CSS for a utility-first design system.
-   **Bundling/Imports:** Uses modern browser features (`importmap`) to import modules directly without a build step.
-   **Persistence:** Browser `localStorage` serves as the application's database.

---

## 2. Project Architecture & Structure

The application is a client-side, single-page application (SPA) architected around a central `App.tsx` component that manages state, views, and data flow.

```
/
├── components/         # Reusable React components
├── services/           # Business logic, API calls, and data management
├── App.tsx             # Main application component, state management, view routing
├── index.html          # Entry point, CSS/JS setup, importmap
├── index.tsx           # React root rendering
├── types.ts            # Centralized TypeScript type definitions
└── DOCUMENTATION.md    # This file
```

### 2.1. Core Concepts

#### State and View Management (`App.tsx`)

-   **Single State Hub:** `App.tsx` acts as the single source of truth. It initializes and manages all major state variables, including the current `view`, logged-in `currentUser`, `studentDirectory`, `adminDirectory`, and `attendance` records.
-   **View Enum:** The `View` type (`'LOGIN'`, `'ADMIN_DASHBOARD'`, etc.) controls which "screen" is rendered. The `renderContent` function in `App.tsx` is a large `switch` statement that renders the appropriate component based on the current `view` state.
-   **Data Flow:** Data is fetched from the `apiService` into the state of `App.tsx`. This data is then passed down as props to the relevant screen components. State mutations are handled by functions within `App.tsx` (e.g., `handleBlockStudent`) which call the `apiService` and then update the state with the returned data, triggering a re-render.

#### Real-time Analysis Loop (`App.tsx`)

The `captureAndAnalyze` function is the heart of the live attendance feature.
1.  **Frame Capture:** It grabs a frame from the `<video>` element and draws it to a hidden `<canvas>`.
2.  **Base64 Conversion:** The canvas content is converted to a Base64 encoded JPEG string.
3.  **API Call:** This string is sent to `geminiService.detectFacesAndHands`.
4.  **Face Tracking:** The results from Gemini are processed. The custom IoU tracking logic matches new detections to existing tracks to maintain a `persistentId`. This is crucial for linking a detected face to a student record over time.
5.  **Data Hydration:** If a `persistentId` is linked to a student (`faceLinks`), the `studentInfo` is attached to the face object.
6.  **Attendance Logging:** If a recognized student is visible and hasn't been logged in the last 5 minutes, `apiService.logAttendance` is called.
7.  **UI Update:** The final `detectionResult` state is updated, which causes `DetectionOverlay` and `DetectionSummary` to re-render with the new information.
8.  **Looping:** An interval (`ANALYSIS_INTERVAL`) calls this function repeatedly. It also includes logic to pause during API rate limits.

---

## 3. Services Deep Dive (`/services`)

The `services` directory abstracts all business logic and external interactions away from the UI components.

-   **`apiService.ts` (Mock Backend)**: This is the most critical service. It simulates a backend server by interacting directly with `storageService.ts` (`localStorage`).
    -   It handles all CRUD operations for students and admins.
    -   Manages authentication (`loginStudent`, `loginAdmin`), registration, and password resets.
    -   Implements business logic, such as checking for duplicate emails or preventing a Principal from being deleted.
    -   Defines custom error types like `BlockedLoginError` to pass specific information back to the UI.

-   **`geminiService.ts`**: The sole interface for the Google Gemini API.
    -   `detectFacesAndHands`: The main function for the analyzer. It takes a base64 image and uses a detailed prompt with a strict JSON schema to get structured data about faces (ID, emotion, bounding box) and hands.
    -   `recognizeFace`: Used for the Face ID login feature. It compares a live capture against a database of user photos.
    -   `askAI`: Powers the AI Assistant. It takes a user prompt and provides a summarized `studentDataContext` to answer questions.
    -   **Error Handling:** Includes specific checks for `RATE_LIMIT` and `NETWORK_ERROR` responses from the API.

-   **`storageService.ts`**: A simple abstraction over `localStorage`. It provides `load` and `save` functions for each major data type (students, admins, attendance, etc.), handling JSON serialization and deserialization.

-   **`emailService.ts`**: Simulates an email system. Instead of sending real emails, it uses a listener pattern. When a function like `sendVerificationEmail` is called, it passes the email object to a listener in `App.tsx`, which then updates the `MockInbox` component's state.

-   **`logService.ts`**: Provides functions for creating and retrieving an audit trail of administrator actions, stored in `localStorage`.

-   **`csvExportService.ts`**: Contains functions to generate and trigger the download of various reports by converting arrays of data into CSV strings.

---

## 4. Component Library (`/components`)

Components are organized by function, from full-page "screens" to smaller, reusable UI elements.

### 4.1. Screen Components

-   **Dashboards (`AdminDashboard`, `TeacherDashboard`, `StudentDashboard`):** These are the main landing pages for logged-in users. They are composed of smaller components and orchestrate the user's primary interactions with the system. They receive all necessary data as props from `App.tsx`.
-   **Authentication (`LoginScreen`, `StudentRegistrationScreen`, `AdminRegistrationScreen`):** Handle the entire auth flow.
-   **Onboarding/Verification (`OnboardingScreen`, `VerificationScreen`):** Guide new users through the final steps of account setup. The `OnboardingScreen` is a multi-step wizard for students to set their photo and password for the first time.
-   **Specialty Screens (`BlockedScreen`, `PromptScreen`, `SettingsScreen`):** Provide dedicated UI for specific states or features, such as viewing a blocked account message or interacting with the AI Assistant.

### 4.2. Key UI Components

-   **`DetectionOverlay.tsx`**: Renders directly on top of the video feed in the Analyzer view. It maps over the `detectionResult` state and draws styled bounding boxes and labels for each detected face and hand.
-   **`DetectionSummary.tsx`**: The sidebar in the Analyzer view. It provides a real-time, human-readable list of all current detections and their details.
-   **`MidTermAssessment.tsx`**: A complex component that allows staff to select a class and subject, load the corresponding students, and enter their mid-term marks in a table.
-   **`BlockStudentModal.tsx`**: A modal that encapsulates the logic for blocking a student. It displays different options (permanent vs. temporary) based on the `currentUser`'s `designation`.
-   **`CameraCapture.tsx`**: A reusable component for capturing a user's photo. It handles camera access, capture, and the option to upload a file instead. It's used in both registration and onboarding.
-   **`MockInbox.tsx`**: A floating button and modal that intercepts simulated emails from the `emailService` and displays them, allowing for a self-contained verification and notification workflow.

---

## 5. Key Data Structures (`types.ts`)

This file is central to the project's stability and developer experience, providing strong typing for all major data entities.

-   `StudentInfo` & `AdminInfo`: These interfaces define the shape of user objects.
    -   **`blockExpiresAt: number | null`**: A key field in `StudentInfo`. `null` means not blocked. A future timestamp indicates a temporary block. `Infinity` signifies a permanent block.
    -   **`blockedBy: string | null`**: Stores the `idNumber` of the admin who initiated the block, enabling accountability.
    -   **`designation: Designation`**: An enum in `AdminInfo` that drives the RBAC logic throughout the app.
-   `DetectionResult`, `FaceResult`, `HandResult`: These types directly mirror the JSON schema expected from the `geminiService`, ensuring that the API response can be safely handled.
-   `AttendanceRecord`: The simple object structure for each attendance log entry, linking a `persistentId` to a timestamp and emotion.
-   `SimulatedEmail`: The structure for emails passed to the `MockInbox`.

---

## 6. Getting Started

The project is designed to run directly in a modern browser without a build step.

### 6.1. Prerequisites

-   A modern web browser with support for `importmap` (Chrome, Edge, Firefox, Safari).
-   A webcam connected and accessible to the browser.

### 6.2. Configuration

**API Key:** The application requires a Google Gemini API key.
-   The key **must** be provided through an environment variable named `API_KEY`.
-   The application is hardcoded to look for `process.env.API_KEY`. There is no UI to enter the key. You must ensure this variable is available in the execution context where the app is served.

### 6.3. Running the Application

1.  Ensure the `API_KEY` environment variable is set.
2.  Serve the project directory using a simple local web server.
3.  Open the served URL in your browser. The application will start on the login screen. A default Principal account is automatically created (`idNumber: principal`, `password: admin`) on first run.
