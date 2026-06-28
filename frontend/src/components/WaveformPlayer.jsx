import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Rewind, Forward } from 'lucide-react';
import { useStore } from '../store/sessionStore';
import { getWaveformUrl } from '../services/api';

const WaveformPlayer = () => {
  const { sessionId, processingStatus } = useStore();
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const isLoadingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fadeOpacity, setFadeOpacity] = useState(0);

  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!wavesurferRef.current) return;
    if (isPlaying) {
      wavesurferRef.current.pause();
      setIsPlaying(false);
    } else {
      wavesurferRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((time) => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.seekTo(time / duration);
  }, [duration]);

  const skip = useCallback((seconds) => {
    if (!wavesurferRef.current) return;
    const currentTime = wavesurferRef.current.getCurrentTime();
    wavesurferRef.current.seekTo((currentTime + seconds) / duration);
  }, [duration]);

  useEffect(() => {
    if (!sessionId || processingStatus !== 'ready') {
      setFadeOpacity(0);
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      isLoadingRef.current = false;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (!waveformRef.current) return;

    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }
    isLoadingRef.current = false;
    
    // Start fade-in animation
    setFadeOpacity(0);
    const fadeTimer = setTimeout(() => setFadeOpacity(1), 50);

    wavesurferRef.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#7c3aed',
      progressColor: '#a78bfa',
      cursorColor: '#ffffff',
      barWidth: 2,
      barGap: 3,
      height: 50,
      normalize: true,
      barRadius: 3,
      cursorWidth: 1,
      playProgress: 0,
      borderRadius: 0,
    });

    fetch(getWaveformUrl(sessionId))
      .then(res => res.blob())
      .then(blob => {
        if (wavesurferRef.current && !isLoadingRef.current) {
          isLoadingRef.current = true;
          wavesurferRef.current.loadBlob(blob);
        }
      })
      .catch(err => console.error('Error loading waveform:', err));

    wavesurferRef.current.on('ready', () => {
      const dur = wavesurferRef.current.getDuration();
      setDuration(dur);
    });

    wavesurferRef.current.on('audioprocess', () => {
      setCurrentTime(wavesurferRef.current.getCurrentTime());
    });

    wavesurferRef.current.on('play', () => setIsPlaying(true));
    wavesurferRef.current.on('pause', () => setIsPlaying(false));

    
    return () => {
      isLoadingRef.current = true;
      clearTimeout(fadeTimer);
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [sessionId, processingStatus]);

  if (processingStatus !== 'ready') return null;

  return (
    <div 
      className="mb-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50 overflow-hidden"
      style={{ 
        opacity: fadeOpacity,
        transition: 'opacity 0.8s ease-in-out'
      }}
    >
      {/* Waveform area - reduced height to prevent visual collision with controls */}
      <div 
        ref={waveformRef} 
        className="w-full" 
        style={{ height: '50px', backgroundColor: '#09090b' }}
      />
      
      {/* Controls */}
      <div className="p-4 flex items-center gap-3">
        {/* Skip back 10s */}
        <button
          onClick={() => skip(-10)}
          className="p-1.5 text-zinc-400 hover:text-white transition-colors"
          title="Back 10s"
        >
          <Rewind size={18} />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlayPause}
          className="p-2 bg-violet-600 hover:bg-violet-500 text-white rounded-full transition-colors shadow-lg shadow-violet-900/30"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        {/* Skip forward 10s */}
        <button
          onClick={() => skip(10)}
          className="p-1.5 text-zinc-400 hover:text-white transition-colors"
          title="Forward 10s"
        >
          <Forward size={18} />
        </button>

        {/* Time display */}
        <span className="text-xs text-zinc-400 font-mono tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Seek slider */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => seekTo(parseFloat(e.target.value))}
          className="flex-1 h-1.5 appearance-none bg-zinc-700 rounded-full cursor-pointer accent-violet-500
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400 
                     [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
};

export default WaveformPlayer;