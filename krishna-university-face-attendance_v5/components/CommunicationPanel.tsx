




import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Conversation, ChatMessage, AdminInfo, StudentInfo, Designation, TimeTableEntry } from '../types';

type CurrentUser = (AdminInfo & { userType: 'ADMIN' }) | (StudentInfo & { userType: 'STUDENT' });

interface CommunicationPanelProps {
    currentUser: CurrentUser;
    conversations: Conversation[];
    // Fix: Update onSendMessage to allow the optional isPriority parameter.
    onSendMessage: (receiverId: string, content: string, isPriority?: boolean) => Promise<void>;
    studentDirectory: Map<string, StudentInfo>;
    adminDirectory: Map<string, AdminInfo>;
    timeTable?: TimeTableEntry[]; // Optional, used by students to find teachers
}

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
);

const UserIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

export const CommunicationPanel: React.FC<CommunicationPanelProps> = ({
    currentUser,
    conversations,
    onSendMessage,
    studentDirectory,
    adminDirectory,
    timeTable
}) => {
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isNewChatView, setIsNewChatView] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const currentUserId = currentUser.userType === 'ADMIN' ? currentUser.idNumber : currentUser.rollNumber;
    const currentUserIsHOD = currentUser.userType === 'ADMIN' && currentUser.designation === Designation.HOD;

    const sortedConversations = useMemo(() => 
        [...conversations].sort((a, b) => b.lastUpdate - a.lastUpdate),
    [conversations]);

    const selectedConversation = useMemo(() => 
        sortedConversations.find(c => c.id === selectedConversationId),
    [sortedConversations, selectedConversationId]);
    
    useEffect(() => {
        // Auto-select the first conversation if none is selected
        if (!selectedConversationId && sortedConversations.length > 0) {
            setSelectedConversationId(sortedConversations[0].id);
        }
    }, [sortedConversations, selectedConversationId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [selectedConversation, newMessage]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedConversation) return;
        
        const otherParticipantId = selectedConversation.participantIds.find(id => id !== currentUserId);
        if (!otherParticipantId) return;

        setIsLoading(true);
        try {
            await onSendMessage(otherParticipantId, newMessage);
            setNewMessage('');
        } catch (error) {
            console.error("Failed to send message:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const getParticipantInfo = (participantId: string) => {
        return adminDirectory.get(participantId) || studentDirectory.get(participantId);
    };
    
    const handleSelectConversation = (id: string | null) => {
        setSelectedConversationId(id);
        setIsNewChatView(false);
    };
    
    const handleNewChat = (teacherId: string) => {
        if (currentUser.userType !== 'STUDENT') return;
        const studentId = currentUser.rollNumber;
        const conversationId = `${studentId}_${teacherId}`;
        const existingConvo = conversations.find(c => c.id === conversationId);
        setSelectedConversationId(existingConvo ? existingConvo.id : `new_${teacherId}`);
        setIsNewChatView(false);
    };

    const scheduledTeachers = useMemo(() => {
        if (currentUser.userType !== 'STUDENT' || !timeTable) return [];
        const teacherIds = new Set<string>();
        const now = new Date();
        const day = now.getDay() === 0 ? 7 : now.getDay();

        timeTable.forEach(entry => {
            if (entry.department === currentUser.department && entry.year === currentUser.year && entry.section === currentUser.section && entry.dayOfWeek === day) {
                teacherIds.add(entry.teacherId);
            }
        });

        return Array.from(teacherIds).map(id => adminDirectory.get(id)).filter((t): t is AdminInfo => !!t);
    }, [currentUser, timeTable, adminDirectory]);

    if (currentUserIsHOD && conversations.length === 0) {
        return <div className="text-center p-8 text-gray-500">No student communications in your department from the last 24 hours.</div>;
    }

    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 h-[75vh] flex">
            <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Conversations</h3>
                </div>
                <div className="flex-grow overflow-y-auto">
                    {currentUser.userType === 'STUDENT' && (
                        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                            <button onClick={() => setIsNewChatView(true)} className="w-full text-center px-3 py-2 text-sm rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all">
                                New Message
                            </button>
                        </div>
                    )}
                    <ul>
                        {sortedConversations.map(convo => {
                            const otherParticipantId = convo.participantIds.find(id => id !== currentUserId);
                            const otherParticipant = otherParticipantId ? getParticipantInfo(otherParticipantId) : null;
                            const lastMessage = convo.messages[convo.messages.length - 1];

                            return (
                                <li key={convo.id} onClick={() => handleSelectConversation(convo.id)} className={`p-4 cursor-pointer border-l-4 ${selectedConversationId === convo.id ? 'bg-gray-100 dark:bg-gray-700/50 border-blue-500' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                                    <p className="font-bold text-gray-900 dark:text-white">{otherParticipant?.name || 'Unknown User'}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{lastMessage.content}</p>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
            <div className="w-2/3 flex flex-col">
                {isNewChatView ? (
                     <div className="p-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Start a new conversation</h3>
                        <ul className="space-y-2">
                           {scheduledTeachers.map(teacher => (
                               <li key={teacher.idNumber} onClick={() => handleNewChat(teacher.idNumber)} className="p-3 rounded-lg hover:bg-gray-700/50 cursor-pointer">
                                   <p className="font-semibold text-white">{teacher.name}</p>
                                   <p className="text-xs text-gray-400">{teacher.department}</p>
                               </li>
                           ))}
                        </ul>
                    </div>
                ) : selectedConversation ? (
                    <>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                           <h3 className="text-lg font-bold text-gray-900 dark:text-white">{getParticipantInfo(selectedConversation.participantIds.find(id => id !== currentUserId)!)?.name || 'Conversation'}</h3>
                        </div>
                        {currentUserIsHOD && (
                            <div className="p-2 text-center bg-yellow-900/40 text-yellow-300 text-xs font-semibold">
                                CONFIDENTIAL: This is a read-only view for administrative oversight. Do not screenshot or distribute. This conversation will be hidden in 24 hours.
                            </div>
                        )}
                        <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                            {selectedConversation.messages.map(msg => (
                                <div key={msg.id} className={`flex items-end gap-2 ${msg.senderId === currentUserId ? 'justify-end' : ''}`}>
                                    <div className={`max-w-md p-3 rounded-2xl ${msg.senderId === currentUserId ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-gray-700 text-gray-200 rounded-bl-lg'}`}>
                                        <p className="text-sm">{msg.content}</p>
                                        <p className="text-xs opacity-60 mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        {!currentUserIsHOD && (
                            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newMessage}
                                        onChange={e => setNewMessage(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && !isLoading && handleSendMessage()}
                                        placeholder="Type a message..."
                                        className="w-full bg-gray-700 border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button onClick={handleSendMessage} disabled={isLoading || !newMessage.trim()} className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-600">
                                        <SendIcon className="w-5 h-5 transform rotate-90" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-grow flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <UserIcon className="w-16 h-16 mx-auto" />
                            <p className="mt-2">Select a conversation to start messaging.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
