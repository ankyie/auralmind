import { useState } from 'react';
import { Upload, X } from 'lucide-react';

const FileUpload = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file) => {
    if (!file.type.startsWith('audio/')) {
      alert('Please upload a valid audio file (MP3, WAV, etc.)');
      return;
    }
    onUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <div 
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
        ${isDragging 
          ? 'border-violet-500 bg-violet-500/10' 
          : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        handleDragLeave();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <input 
        type="file" 
        accept="audio/*" 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) handleFile(file);
        }}
      />
      
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center">
          <Upload className="text-zinc-400" size={24} />
        </div>
        <div>
          <p className="text-zinc-200 font-medium">Upload Audio File</p>
          <p className="text-zinc-500 text-sm mt-1">Drag & drop or click to browse</p>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;