import React, { useState } from 'react';
import { StudentInfo, StudyGroup, SharedNote } from '../types';
import { StudyGroupsPanel } from './StudyGroupsPanel';
import { NotesExchangePanel } from './NotesExchangePanel';
import { UsersIcon } from './UsersIcon';
import { DocumentTextIcon } from './DocumentTextIcon';

interface CommunityPanelProps {
    currentUser: StudentInfo;
    studyGroups: StudyGroup[];
    sharedNotes: SharedNote[];
    onCreateStudyGroup: (groupData: Omit<StudyGroup, 'id' | 'events' | 'messages'>) => Promise<void>;
    onJoinStudyGroup: (groupId: string) => Promise<void>;
    onSendGroupMessage: (groupId: string, content: string, file?: { name: string; url: string }, isPriority?: boolean) => Promise<void>;
    onUploadNote: (noteData: Omit<SharedNote, 'id' | 'ratings' | 'createdAt'>) => Promise<void>;
    onRateNote: (noteId: string, rating: number) => Promise<void>;
    onSuggestStudyTime: (groupId: string) => Promise<{ dayOfWeek: number, startTime: string, reason: string }[]>;
    onSummarizeNote: (noteId: string) => Promise<string>;
}

type CommunityTab = 'groups' | 'notes';

export const CommunityPanel: React.FC<CommunityPanelProps> = (props) => {
    const [activeTab, setActiveTab] = useState<CommunityTab>('groups');

    return (
        <div className="w-full animate-fade-in">
            <div className="mb-6">
                <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg border border-gray-200 dark:border-gray-700 max-w-sm mx-auto">
                    <button
                        onClick={() => setActiveTab('groups')}
                        className={`w-full flex justify-center items-center gap-2 py-2 px-4 font-medium text-sm rounded-md transition-colors ${activeTab === 'groups' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
                    >
                        <UsersIcon className="w-5 h-5" />
                        Study Groups
                    </button>
                    <button
                        onClick={() => setActiveTab('notes')}
                        className={`w-full flex justify-center items-center gap-2 py-2 px-4 font-medium text-sm rounded-md transition-colors ${activeTab === 'notes' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'}`}
                    >
                        <DocumentTextIcon className="w-5 h-5" />
                        Notes Exchange
                    </button>
                </div>
            </div>

            <div>
                {activeTab === 'groups' && <StudyGroupsPanel {...props} />}
                {activeTab === 'notes' && <NotesExchangePanel {...props} />}
            </div>
        </div>
    );
};