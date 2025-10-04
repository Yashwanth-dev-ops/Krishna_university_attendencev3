import React, { useState } from 'react';
import { StudentInfo, StudyGroup, Year } from '../types';

interface CreateStudyGroupModalProps {
    currentUser: StudentInfo;
    onClose: () => void;
    onCreate: (groupData: Omit<StudyGroup, 'id' | 'events' | 'messages'>) => Promise<void>;
}

export const CreateStudyGroupModal: React.FC<CreateStudyGroupModalProps> = ({ currentUser, onClose, onCreate }) => {
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [maxSize, setMaxSize] = useState(10);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !subject.trim()) {
            setError('Group name and subject are required.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            await onCreate({
                name,
                subject,
                description,
                maxSize,
                department: currentUser.department,
                year: currentUser.year,
                section: currentUser.section,
                createdBy: currentUser.rollNumber,
                members: [currentUser.rollNumber],
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create group.');
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700 w-full max-w-lg m-4" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-6">Create a New Study Group</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" placeholder="Group Name (e.g., Algo Champions)" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" required />
                    <input type="text" placeholder="Subject (e.g., Data Structures)" value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" required />
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="A brief description of the group's goals..." rows={3} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Max Group Size: {maxSize}</label>
                        <input type="range" min="2" max="20" value={maxSize} onChange={e => setMaxSize(parseInt(e.target.value, 10))} className="w-full" />
                    </div>
                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-6 py-2 rounded-md text-gray-300 bg-slate-700 hover:bg-slate-600 transition-colors">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-6 py-2 rounded-md font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50">
                            {isLoading ? 'Creating...' : 'Create Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
