import React, { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

const TagInput: React.FC<TagInputProps> = ({ tags, onChange, placeholder = '输入后按回车...', className }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (newTag && !tags.includes(newTag)) {
        onChange([...tags, newTag]);
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className={`flex flex-wrap gap-2 p-2 border border-slate-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition-all ${className}`}>
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center px-2 py-1 rounded bg-brand-50 text-brand-700 text-sm border border-brand-100 animate-in fade-in zoom-in duration-200">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-1 text-brand-400 hover:text-brand-600 focus:outline-none"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] outline-none text-sm bg-transparent py-1"
      />
    </div>
  );
};

export default TagInput;
