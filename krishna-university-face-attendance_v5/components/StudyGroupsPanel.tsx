import React, { useState, useMemo, useEffect } from 'react';
import { StudentInfo, StudyGroup } from '../types';
import { CreateStudyGroupModal } from './CreateStudyGroupModal';
import { UsersIcon } from './UsersIcon';
import { StudyGroupChatModal } from './StudyGroupChatModal';

interface StudyGroupsPanelProps {
    currentUser: StudentInfo;
    studyGroups: StudyGroup[];
    onCreateStudyGroup: (groupData: Omit<StudyGroup, 'id' | 'events' | 'messages'>) => Promise<void>;
    onJoinStudyGroup: (groupId: string) => Promise<void>;
    onSendGroupMessage: (groupId: string, content: string, file?: { name: string; url: string }, isPriority?: boolean) => Promise<void>;
}

export const StudyGroupsPanel: React.FC<StudyGroupsPanelProps> = ({ currentUser, studyGroups, onCreateStudyGroup, onJoinStudyGroup, onSendGroupMessage }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [activeChatGroup, setActiveChatGroup] = useState<StudyGroup | null>(null);
    const [joinLoading, setJoinLoading] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // This effect synchronizes the active chat group's data with the latest
        // data from props. This is crucial for seeing new messages in real-time.
        if (activeChatGroup) {
            const updatedGroup = studyGroups.find(g => g.id === activeChatGroup.id);
            if (updatedGroup) {
                // To prevent potential re-render loops, only update if the data is actually different.
                // A quick check on message count is efficient.
                if (updatedGroup.messages.length !== activeChatGroup.messages.length) {
                    setActiveChatGroup(updatedGroup);
                }
            } else {
                // If the group is not found (e.g., user left/was removed), close the modal.
                setActiveChatGroup(null);
            }
        }
    }, [studyGroups, activeChatGroup]);

    const { myGroups, suggestedGroups } = useMemo(() => {
        const myGroupIds = new Set(currentUser.studyGroupIds || []);
        const my = studyGroups.filter(g => myGroupIds.has(g.id));
        const suggested = studyGroups.filter(g => 
            !myGroupIds.has(g.id) && 
            g.department === currentUser.department &&
            g.year === currentUser.year
        );
        return { myGroups: my, suggestedGroups: suggested };
    }, [currentUser, studyGroups]);

    const handleJoin = async (groupId: string) => {
        setJoinLoading(prev => ({ ...prev, [groupId]: true }));
        try {
            await onJoinStudyGroup(groupId);
        } catch (error) {
            console.error('Failed to join group:', error);
            // In a real app, show a toast notification
        } finally {
            setJoinLoading(prev => ({ ...prev, [groupId]: false }));
        }
    };

    return (
        <>
            {isCreateModalOpen && (
                <CreateStudyGroupModal
                    currentUser={currentUser}
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreate={onCreateStudyGroup}
                />
            )}
            {activeChatGroup && (
                <StudyGroupChatModal
                    group={activeChatGroup}
                    currentUser={currentUser}
                    onClose={() => setActiveChatGroup(null)}
                    onSendGroupMessage={onSendGroupMessage}
                />
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">My Study Groups ({myGroups.length})</h3>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        {myGroups.length > 0 ? myGroups.map(group => (
                            <div key={group.id} className="bg-white dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                <p className="font-bold text-gray-900 dark:text-white">{group.name}</p>
                                <p className="text-sm text-blue-500 dark:text-blue-400">{group.subject}</p>
                                <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center gap-1">
                                        <UsersIcon className="w-4 h-4" />
                                        <span>{group.members.length} / {group.maxSize} members</span>
                                    </div>
                                    <button onClick={() => setActiveChatGroup(group)} className="font-semibold text-blue-500 hover:underline">View</button>
                                </div>
                            </div>
                        )) : <p className="text-gray-500 text-center py-8">You haven't joined any groups yet.</p>}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Find Groups</h3>
                        <button onClick={() => setIsCreateModalOpen(true)} className="px-4 py-2 text-sm rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all">
                            Create Group
                        </button>
                    </div>
                     <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        {suggestedGroups.length > 0 ? suggestedGroups.map(group => (
                            <div key={group.id} className="bg-white dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                <p className="font-bold text-gray-900 dark:text-white">{group.name}</p>
                                <p className="text-sm text-blue-500 dark:text-blue-400">{group.subject}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{group.description}</p>
                                <div className="flex items-center justify-between mt-2">
                                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                        <UsersIcon className="w-4 h-4" />
                                        <span>{group.members.length} / {group.maxSize} members</span>
                                    </div>
                                    <button onClick={() => handleJoin(group.id)} disabled={joinLoading[group.id] || group.members.length >= group.maxSize} className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded hover:bg-green-500 disabled:bg-gray-500">
                                        {joinLoading[group.id] ? 'Joining...' : 'Join'}
                                    </button>
                                </div>
                            </div>
                        )) : <p className="text-gray-500 text-center py-8">No suggested groups for your department and year.</p>}
                    </div>
                </div>
            </div>
        </>
    );
};