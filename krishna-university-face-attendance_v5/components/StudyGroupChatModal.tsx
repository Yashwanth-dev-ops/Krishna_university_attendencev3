
import React, { useState, useRef, useEffect } from 'react';
import { StudyGroup, StudentInfo } from '../types';
import { PaperClipIcon } from './PaperClipIcon';
import { DownloadIcon } from './DownloadIcon';

interface StudyGroupChatModalProps {
    group: StudyGroup;
    currentUser: StudentInfo;
    onClose: () => void;
    // Fix: Add optional isPriority parameter to match the function signature from App.tsx.
    onSendGroupMessage: (groupId: string, content: string, file?: { name: string; url: string }, isPriority?: boolean) => Promise<void>;
}

const LoadingSpinner: React.FC = () => (
    <div className="w-5 h-5 border-2 border-t-2 border-gray-200 border-t-transparent rounded-full animate-spin"></div>
);

export const StudyGroupChatModal: React.FC<StudyGroupChatModalProps> = ({ group, currentUser, onClose, onSendGroupMessage }) => {
    const [message, setMessage] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            // Instantly scroll to the bottom when new messages are added or the modal opens.
            // This is more reliable than smooth scrolling.
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [group.messages]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSend = async () => {
        if ((!message.trim() && !file) || isLoading) return;

        setIsLoading(true);
        try {
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const url = e.target?.result as string;
                    await onSendGroupMessage(group.id, message, { name: file.name, url });
                    setMessage('');
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    setIsLoading(false);
                };
                reader.readAsDataURL(file);
            } else {
                await onSendGroupMessage(group.id, message);
                setMessage('');
                setIsLoading(false);
            }
        } catch (error) {
            console.error("Failed to send message:", error);
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-2xl m-4 h-[80vh] flex flex-col animate-scale-in" onClick={e => e.stopPropagation()}>
                <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-white">{group.name}</h2>
                        <p className="text-sm text-blue-400">{group.subject}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <main ref={chatContainerRef} className="flex-grow p-4 space-y-4 overflow-y-auto">
                    {group.messages.map(msg => (
                        <div key={msg.id} className={`flex flex-col ${msg.senderId === currentUser.rollNumber ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-md px-4 py-3 rounded-lg ${msg.senderId === currentUser.rollNumber ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                                <p className="text-xs font-bold opacity-80 mb-1">{msg.senderId === currentUser.rollNumber ? 'You' : msg.senderId}</p>
                                {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                                {msg.file && (
                                    <a href={msg.file.url} download={msg.file.name} className="mt-2 flex items-center gap-2 bg-black/20 p-2 rounded-lg hover:bg-black/40">
                                        <DownloadIcon className="w-5 h-5 flex-shrink-0" />
                                        <span className="text-sm font-semibold truncate">{msg.file.name}</span>
                                    </a>
                                )}
                                <p className="text-xs opacity-60 mt-2 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                        </div>
                    ))}
                </main>

                <footer className="flex-shrink-0 p-4 border-t border-gray-700">
                    {file && (
                        <div className="mb-2 flex items-center justify-between bg-gray-700/50 p-2 rounded-md text-sm">
                            <span className="truncate text-gray-300">{file.name}</span>
                            <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="p-1 rounded-full text-gray-400 hover:bg-gray-600">&times;</button>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && !isLoading && handleSend()}
                            placeholder="Type a message..."
                            className="w-full bg-gray-700 border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                        <label htmlFor="file-upload" className="p-3 rounded-full text-gray-300 hover:bg-gray-700 cursor-pointer">
                           <PaperClipIcon className="w-5 h-5" />
                           <input id="file-upload" type="file" onChange={handleFileChange} className="hidden" />
                        </label>
                        <button onClick={handleSend} disabled={isLoading || (!message.trim() && !file)} className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-600">
                            {isLoading ? <LoadingSpinner /> : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            )}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
