import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Mic, Video, Square, Download, Settings, RefreshCcw, Type, Monitor, AlertCircle, Upload, Youtube, Info, MessageSquare, ChevronDown, Keyboard } from 'lucide-react';

const App = () => {
    // --- State Management ---
    const [script, setScript] = useState("こんにちは。「台本読めるカメラ」へようこそ。\n\nこのアプリは、動画撮影中に台本をカメラ画面に表示しながら、あなたの音声を認識して自動的にスクロールする、次世代のテレプロンプターです。\n\n\n【主な機能】\n\nまず、音声認識機能についてご説明します。\n\nあなたが台本を読み上げると、リアルタイムで音声を認識し、今読んでいる箇所を自動的に追従します。もう手動でスクロールする必要はありません。\n\n次に、スマートマッチング機能です。\n\n従来のテレプロンプターでは、一言一句正確に読まないと止まってしまいました。しかし、このアプリは違います。AIによる高度なマッチングロジックにより、言い回しを少し変えても、言葉を飛ばしても、自動的に追従します。\n\nたとえば、台本に「スクリプトとの参照」と書いてあっても、「スクリプトの参照」と読んでしまった場合でも、AIが文章の類似度を判断して、スムーズに先に進みます。\n\n\n【使い方のコツ】\n\n台本の途中から読み始めても大丈夫です。\n\nこのアプリは台本全体を検索して、あなたが今読んでいる箇所を自動的に見つけます。読み飛ばしても、前に戻っても、柔軟に対応します。\n\nまた、画面右下には認識状態が表示されます。緑色の「LISTENING」表示が出ていれば、音声認識が正常に動作しています。\n\nもし進まない時は、矢印キーの下ボタン、または画面をタップすることで、手動で送ることもできます。\n\n\n【撮影のヒント】\n\n背景は透明度が高く設定されているので、カメラに映るあなたの表情がしっかり見えます。自然な目線で、カメラを見ながら台本を読むことができます。\n\nフォントサイズは設定から自由に調整可能です。撮影環境や距離に合わせて、最適なサイズを見つけてください。\n\n認識済みの文字は白色になるので、今どこまで読んだか一目でわかります。\n\n\n【最後に】\n\nこのアプリを使えば、プロフェッショナルな動画撮影が、誰でも簡単にできるようになります。\n\nYouTube動画、プレゼンテーション、商品紹介、オンライン講義など、様々なシーンでご活用ください。\n\nそれでは、素晴らしい動画撮影をお楽しみください。");
    const [isRecording, setIsRecording] = useState(false);
    const [recognizedText, setRecognizedText] = useState("");
    const [matchedIndex, setMatchedIndex] = useState(0);
    const [cameraActive, setCameraActive] = useState(false);
    const [fontSize, setFontSize] = useState(32);
    const [showSettings, setShowSettings] = useState(false);
    const [videoUrl, setVideoUrl] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    // Device Selection States
    const [videoDevices, setVideoDevices] = useState([]);
    const [audioDevices, setAudioDevices] = useState([]);
    const [selectedVideoId, setSelectedVideoId] = useState("");
    const [selectedAudioId, setSelectedAudioId] = useState("");

    // --- Refs ---
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recognitionRef = useRef(null);
    const chunksRef = useRef([]);
    const scriptContainerRef = useRef(null);
    const wordRefs = useRef([]);
    const isRecognizingRef = useRef(false);
    const fileInputRef = useRef(null);

    // --- Constants for Optimization ---
    const VISIBLE_RANGE_BEFORE = 200;
    const VISIBLE_RANGE_AFTER = 500;

    const [recognitionStatus, setRecognitionStatus] = useState('inactive'); // inactive, starting, listening, error
    const [debugInfo, setDebugInfo] = useState(null); // マッチングデバッグ情報

    // --- Speech Recognition Setup ---
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'ja-JP';

            recognition.onstart = () => {
                console.log('音声認識が開始されました');
                isRecognizingRef.current = true;
                setRecognitionStatus('listening');
                setErrorMessage(null);
            };

            recognition.onend = () => {
                isRecognizingRef.current = false;
                setRecognitionStatus('inactive');
                if (isRecording) {
                    try {
                        setRecognitionStatus('starting');
                        recognition.start();
                    } catch (e) {
                        console.log("Recognition auto-restart failed:", e);
                        setRecognitionStatus('error');
                    }
                }
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                const currentSpeech = finalTranscript + interimTranscript;
                setRecognizedText(currentSpeech);
                findMatchInScript(currentSpeech);
            };

            recognition.onerror = (event) => {
                console.error("Speech recognition error:", event.error, event);
                setRecognitionStatus('error');

                if (event.error === 'no-speech') {
                    // 無視してOK
                    console.log('no-speech エラーは無視します');
                    return;
                }

                let msg = "音声認識エラーが発生しました。";
                if (event.error === 'audio-capture') {
                    msg = "マイク競合エラー: カメラとマイクを再起動してください。録画を一度停止してから再開してみてください。";
                    setIsRecording(false);
                } else if (event.error === 'not-allowed') {
                    msg = "マイクの使用が許可されていません。ブラウザのアドレスバーの鍵アイコンからマイクを許可してください。";
                } else if (event.error === 'network') {
                    msg = "ネットワークエラー: 音声認識にはインターネット接続が必要です。";
                } else if (event.error === 'aborted') {
                    msg = "音声認識が中断されました。";
                } else if (event.error === 'service-not-allowed') {
                    msg = "このブラウザでは音声認識サービスが許可されていません。HTTPSで接続されているか確認してください。";
                }

                console.log('エラーメッセージ:', msg);
                setErrorMessage(msg);
            };

            recognitionRef.current = recognition;
        } else {
            setErrorMessage("このブラウザは音声認識未対応です。Chromeをご利用ください。");
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
            }
        };
    }, [script, isRecording]);

    // --- Device Enumeration ---
    const getDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const vDevs = devices.filter(d => d.kind === 'videoinput');
            const aDevs = devices.filter(d => d.kind === 'audioinput');
            setVideoDevices(vDevs);
            setAudioDevices(aDevs);
        } catch (err) {
            console.error("デバイス一覧取得エラー", err);
        }
    };

    useEffect(() => {
        getDevices();
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', getDevices);
        };
    }, []);

    // --- Manual Scroll Controls (Keyboard) ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                setMatchedIndex(prev => Math.min(script.length - 1, prev + 10));
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                setMatchedIndex(prev => Math.max(0, prev - 10));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [script]);

    // --- Improved Smart Matching Logic ---
    const findMatchInScript = (spokenText) => {
        if (!spokenText || spokenText.length < 3) return;

        // 無視する文字のパターン
        const IGNORE_CHARS_PATTERN = /[、。！？\s\n「」『』・（）()\[\]…―\-~～!?,.]/g;

        // より正確な類似度計算
        const calculateSimilarity = (str1, str2) => {
            if (!str1 || !str2) return 0;
            let matchCount = 0;
            let searchIndex = 0;

            for (let i = 0; i < str1.length; i++) {
                const foundIndex = str2.indexOf(str1[i], searchIndex);
                if (foundIndex !== -1) {
                    matchCount++;
                    searchIndex = foundIndex + 1;
                }
            }
            return (matchCount * 2) / (str1.length + str2.length);
        };

        // 正規化関数
        const normalize = (str) => str.replace(IGNORE_CHARS_PATTERN, "");

        // より長い発話履歴を使用（100文字）
        const recentSpoken = spokenText.slice(-100);
        const cleanRecentSpoken = normalize(recentSpoken);

        // 検索範囲を大幅に拡大：前方100文字、後方1000文字
        const searchStart = Math.max(0, matchedIndex - 100);
        const searchEnd = Math.min(script.length, matchedIndex + 1000);
        const targetScriptSlice = script.slice(searchStart, searchEnd);
        const cleanTargetScript = normalize(targetScriptSlice);

        let bestMatchIndex = -1;
        let maxScore = 0;
        let bestMatchedPhrase = "";

        // より長いフレーズでマッチング（10-20文字）
        const windowSizes = [20, 15, 12, 10, 8];

        for (let size of windowSizes) {
            for (let i = 0; i <= cleanTargetScript.length - size; i++) {
                const chunk = cleanTargetScript.substr(i, size);

                // 発話の末尾30文字との類似度を計算
                const recentTail = cleanRecentSpoken.slice(-30);
                const score = calculateSimilarity(chunk, recentTail);

                // 閾値を60%に下げて柔軟に
                if (score > 0.6) {
                    // スコアに重み付け：長いマッチほど優先、現在地に近いほうが優先
                    const distanceFromCurrent = Math.abs(i - (matchedIndex - searchStart));
                    const distancePenalty = distanceFromCurrent > 50 ? 0.9 : 1.0;
                    const weightedScore = score * size * distancePenalty;

                    if (weightedScore > maxScore) {
                        maxScore = weightedScore;
                        bestMatchIndex = i + size;
                        bestMatchedPhrase = chunk;
                    }
                }
            }

            // 良いマッチが見つかったら早期終了
            if (maxScore > 12) break;
        }

        // デバッグ情報をコンソールと画面に出力
        if (bestMatchIndex > -1) {
            const debugData = {
                phrase: bestMatchedPhrase,
                score: maxScore.toFixed(2),
                position: bestMatchIndex + searchStart,
                spoken: cleanRecentSpoken.slice(-20)
            };
            console.log('マッチ検出:', debugData);
            setDebugInfo(debugData);
        } else {
            setDebugInfo({ score: '0', phrase: 'マッチなし' });
        }

        // 結果の適用
        if (bestMatchIndex > -1) {
            let currentCleanIndex = 0;
            let originalIndex = searchStart;

            while (originalIndex < script.length) {
                if (script[originalIndex].replace(IGNORE_CHARS_PATTERN, "").length > 0) {
                    if (currentCleanIndex === bestMatchIndex) break;
                    currentCleanIndex++;
                }
                originalIndex++;
            }

            // 前方へのジャンプも許可
            if (originalIndex !== matchedIndex) {
                console.log('位置更新:', matchedIndex, '->', originalIndex);
                setMatchedIndex(originalIndex);
            }
        }
    };

    useEffect(() => {
        const activeEl = wordRefs.current[matchedIndex];
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [matchedIndex]);

    // --- Camera Helpers ---
    const startCamera = async (videoId = null, audioId = null) => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        try {
            setErrorMessage(null);
            const constraints = {
                video: videoId ? { deviceId: { exact: videoId } } : true,
                audio: audioId ? { deviceId: { exact: audioId }, echoCancellation: true } : { echoCancellation: true }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            await getDevices();

            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];
            const currentVideoId = videoTrack.getSettings().deviceId;
            const currentAudioId = audioTrack.getSettings().deviceId;

            setSelectedVideoId(videoId || currentVideoId);
            setSelectedAudioId(audioId || currentAudioId);

            videoRef.current.srcObject = stream;
            streamRef.current = stream;
            setCameraActive(true);
        } catch (err) {
            setErrorMessage("カメラ起動失敗: デバイスへのアクセス権限を確認してください。");
            console.error(err);
            setCameraActive(false);
        }
    };

    const handleDeviceChange = (type, deviceId) => {
        if (type === 'video') {
            setSelectedVideoId(deviceId);
            startCamera(deviceId, selectedAudioId);
        } else {
            setSelectedAudioId(deviceId);
            startCamera(selectedVideoId, deviceId);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setCameraActive(false);
            setMatchedIndex(0);
            setRecognizedText("");
        }
    };

    const startRecording = () => {
        if (!streamRef.current) {
            setErrorMessage("先にカメラを起動してください");
            return;
        }
        chunksRef.current = [];
        try {
            const mediaRecorder = new MediaRecorder(streamRef.current);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoUrl(url);
            };
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            setIsRecording(true);
            setMatchedIndex(0);

            // 音声認識を開始（少し遅延を入れて競合を避ける）
            if (recognitionRef.current && !isRecognizingRef.current) {
                setTimeout(() => {
                    try {
                        console.log('音声認識を開始します...');
                        setRecognitionStatus('starting');
                        recognitionRef.current.start();
                    } catch (e) {
                        console.error('音声認識開始エラー:', e);
                        setErrorMessage(`音声認識エラー: ${e.message || '不明なエラー'}。マイクが他のアプリで使用されている可能性があります。`);
                        setRecognitionStatus('error');
                    }
                }, 300);
            }
        } catch (err) {
            setErrorMessage("録画開始エラー");
            setIsRecording(false);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            isRecognizingRef.current = false;
        }
        setIsRecording(false);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setScript(e.target.result);
                setMatchedIndex(0);
                setErrorMessage(null);
            };
            reader.readAsText(file);
        }
    };

    // 手動送り用ハンドラ（画面タップ用）
    const handleManualAdvance = (e) => {
        // コントロール類をクリックしたときは発火しないように
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        // スクリプトエリアをクリックした場合のみ進める
        setMatchedIndex(prev => Math.min(script.length - 1, prev + 15));
    };

    const renderedContent = useMemo(() => {
        const start = Math.max(0, matchedIndex - VISIBLE_RANGE_BEFORE);
        const end = Math.min(script.length, matchedIndex + VISIBLE_RANGE_AFTER);

        const visiblePart = script.slice(start, end);

        const items = visiblePart.split('').map((char, localIndex) => {
            const globalIndex = start + localIndex;
            const isRead = globalIndex <= matchedIndex;
            const isCurrent = globalIndex === matchedIndex;

            return (
                <span
                    key={globalIndex}
                    ref={el => wordRefs.current[globalIndex] = el}
                    className={`transition-colors duration-200 font-bold ${isRead
                        ? 'text-yellow-400'
                        : 'text-gray-900 drop-shadow-sm opacity-90'
                        } ${isCurrent ? 'text-3xl' : ''}`}
                    style={{
                        textShadow: isRead ? 'none' : '0 1px 2px rgba(255,255,255,0.8)'
                    }}
                >
                    {char}
                </span>
            );
        });

        return (
            <>
                {start > 0 && <div className="text-gray-400 text-sm mb-4">... (前の{start}文字)</div>}
                {items}
                {end < script.length && <div className="text-gray-400 text-sm mt-4">... (残り{script.length - end}文字)</div>}
            </>
        );
    }, [script, matchedIndex]);

    return (
        <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">

            {/* Header */}
            <header className="p-3 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-20 h-16">
                <div className="flex items-center gap-2 pl-2">
                    <div className="bg-red-600 text-white p-1.5 rounded-lg">
                        <Video size={20} fill="currentColor" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        台本読めるカメラ
                    </h1>
                </div>
                <div className="flex gap-3">
                    {!cameraActive ? (
                        <button onClick={() => startCamera()} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-full font-medium transition shadow-sm">
                            <Video size={18} /> カメラ起動
                        </button>
                    ) : (
                        <button onClick={stopCamera} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2 rounded-full font-medium transition">
                            停止
                        </button>
                    )}
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-2.5 hover:bg-gray-100 rounded-full text-gray-600 transition"
                        title="設定"
                    >
                        <Settings size={22} />
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 relative flex justify-center bg-gray-100">

                {/* Error Alert */}
                {errorMessage && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-100 border border-red-400 text-red-700 px-6 py-3 rounded-lg shadow-md flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                        <AlertCircle size={24} />
                        <span className="font-medium">{errorMessage}</span>
                        <button onClick={() => setErrorMessage(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
                    </div>
                )}

                {/* Video Layer */}
                <div className="relative w-full h-full bg-black overflow-hidden group">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                    />

                    {!cameraActive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50 z-0">
                            <div className="p-6 bg-white rounded-full shadow-sm mb-4">
                                <Monitor size={48} className="text-gray-300" />
                            </div>
                            <p className="text-lg font-medium text-gray-500">カメラを起動してスタート</p>
                        </div>
                    )}

                    {/* Teleprompter Overlay & Click Area for Manual Advance */}
                    {cameraActive && (
                        <div
                            ref={scriptContainerRef}
                            onClick={handleManualAdvance} // 画面タップで進む
                            className="absolute z-10 inset-0 overflow-y-auto no-scrollbar py-[45vh] px-4 md:px-16 text-center cursor-pointer"
                            style={{
                                fontSize: `${fontSize}px`,
                                lineHeight: '1.8',
                                maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)'
                            }}
                        >
                            <div className="inline-block w-full max-w-4xl bg-white/40 backdrop-blur-sm px-8 py-8 rounded-2xl shadow-sm border border-white/30 pointer-events-none">
                                {renderedContent}
                            </div>
                        </div>
                    )}

                    {/* Realtime Recognition Subtitles & Help */}
                    {cameraActive && (
                        <div className="absolute bottom-28 right-4 z-30 flex flex-col gap-2 items-end">

                            {/* Status Indicator */}
                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm border ${recognitionStatus === 'listening' ? 'bg-green-500/90 text-white border-green-400 animate-pulse' :
                                recognitionStatus === 'error' ? 'bg-red-500/90 text-white border-red-400' :
                                    'bg-gray-500/80 text-white border-gray-400'
                                }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${recognitionStatus === 'listening' ? 'bg-white' : 'bg-gray-300'}`}></div>
                                {recognitionStatus === 'listening' ? 'LISTENING' :
                                    recognitionStatus === 'error' ? 'ERROR' :
                                        recognitionStatus === 'starting' ? 'STARTING...' : 'STANDBY'}
                            </div>

                            {/* Keyboard Help */}
                            <div className="bg-black/40 backdrop-blur text-white/70 text-[10px] px-2 py-1 rounded border border-white/10 flex items-center gap-1">
                                <Keyboard size={10} /> 矢印↓ or タップで強制送り
                            </div>

                            {/* Recognition Text */}
                            {recognizedText && (
                                <div className="max-w-xs bg-black/60 backdrop-blur text-white text-xs p-3 rounded-lg border border-white/10 shadow-lg animate-in fade-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-2 mb-1 text-gray-400 uppercase font-bold text-[10px]">
                                        <MessageSquare size={10} /> 認識中の音声
                                    </div>
                                    <p className="line-clamp-3 opacity-90 font-mono leading-relaxed">
                                        {recognizedText.slice(-50)}
                                    </p>
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* Settings Modal */}
                {showSettings && (
                    <div className="absolute top-4 right-4 z-40 bg-white p-5 rounded-xl shadow-2xl border border-gray-100 w-96 animate-in slide-in-from-right-5 fade-in duration-200">
                        <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2 pb-2 border-b border-gray-100">
                            <Settings size={18} className="text-red-600" /> 設定
                        </h3>

                        <div className="space-y-6">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">文字サイズ ({fontSize}px)</label>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm">A</span>
                                    <input
                                        type="range" min="20" max="80" value={fontSize}
                                        onChange={(e) => setFontSize(Number(e.target.value))}
                                        className="flex-1 accent-red-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-xl font-bold">A</span>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                                        <Type size={12} /> 台本編集
                                    </label>
                                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                        {script.length.toLocaleString()} 文字
                                    </span>
                                </div>
                                <textarea
                                    value={script}
                                    onChange={(e) => {
                                        setScript(e.target.value);
                                        setMatchedIndex(0);
                                    }}
                                    className="w-full h-40 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition resize-none"
                                    placeholder="ここに原稿を入力..."
                                />
                                <div className="mt-2 flex justify-end">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="text-xs flex items-center gap-1.5 text-gray-600 hover:text-red-600 transition font-medium px-3 py-1.5 rounded-md hover:bg-red-50"
                                    >
                                        <Upload size={14} /> ファイル(.txt)を読込
                                    </button>
                                    <input type="file" accept=".txt" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Recording Controls & Device Selector */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-4 w-full">

                    {/* Control Buttons */}
                    <div className="flex items-center gap-4">
                        {!isRecording ? (
                            <button
                                onClick={startRecording}
                                disabled={!cameraActive}
                                className={`flex items-center gap-3 px-8 py-4 rounded-full font-bold text-lg shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all ${cameraActive
                                    ? 'bg-red-600 text-white hover:bg-red-700'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <div className={`w-4 h-4 rounded-full ${cameraActive ? 'bg-white' : 'bg-gray-400'}`}></div>
                                録画スタート
                            </button>
                        ) : (
                            <button
                                onClick={stopRecording}
                                className="flex items-center gap-3 bg-white text-gray-800 px-8 py-4 rounded-full font-bold text-lg shadow-xl border border-gray-200 hover:bg-gray-50 transition animate-pulse"
                            >
                                <Square size={20} className="fill-red-600 text-red-600" />
                                <span>録画停止 <span className="text-xs font-normal text-gray-500 ml-1">({Math.floor(matchedIndex / script.length * 100)}%)</span></span>
                            </button>
                        )}

                        <button
                            onClick={() => { setMatchedIndex(0); }}
                            className="p-4 rounded-full bg-white text-gray-600 shadow-lg border border-gray-100 hover:bg-gray-50 hover:text-red-600 transition"
                            title="最初に戻る"
                        >
                            <RefreshCcw size={22} />
                        </button>
                    </div>

                    {/* Device Info & Selector */}
                    {cameraActive && (
                        <div className="flex items-center gap-4 bg-black/70 backdrop-blur text-white px-5 py-2 rounded-full text-xs font-medium border border-white/20 shadow-lg animate-in fade-in slide-in-from-bottom-2">

                            {/* Camera Selector */}
                            <div className="flex items-center gap-2 relative group">
                                <Video size={14} className="text-gray-300" />
                                <div className="relative">
                                    <select
                                        value={selectedVideoId}
                                        onChange={(e) => handleDeviceChange('video', e.target.value)}
                                        disabled={isRecording}
                                        className="appearance-none bg-transparent text-white pl-1 pr-6 py-1 focus:outline-none cursor-pointer max-w-[150px] truncate disabled:opacity-50 disabled:cursor-not-allowed hover:text-blue-200 transition"
                                    >
                                        {videoDevices.length > 0 ? (
                                            videoDevices.map(device => (
                                                <option key={device.deviceId} value={device.deviceId} className="text-black bg-white">
                                                    {device.label || `カメラ ${device.deviceId.slice(0, 5)}...`}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" className="text-black">カメラが見つかりません</option>
                                        )}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <div className="w-px h-4 bg-white/30"></div>

                            {/* Mic Selector */}
                            <div className="flex items-center gap-2 relative group">
                                <Mic size={14} className="text-gray-300" />
                                <div className="relative">
                                    <select
                                        value={selectedAudioId}
                                        onChange={(e) => handleDeviceChange('audio', e.target.value)}
                                        disabled={isRecording}
                                        className="appearance-none bg-transparent text-white pl-1 pr-6 py-1 focus:outline-none cursor-pointer max-w-[150px] truncate disabled:opacity-50 disabled:cursor-not-allowed hover:text-blue-200 transition"
                                    >
                                        {audioDevices.length > 0 ? (
                                            audioDevices.map(device => (
                                                <option key={device.deviceId} value={device.deviceId} className="text-black bg-white">
                                                    {device.label || `マイク ${device.deviceId.slice(0, 5)}...`}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" className="text-black">マイクが見つかりません</option>
                                        )}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Debug Info - Subtle Display */}
                            {debugInfo && (
                                <>
                                    <div className="w-px h-4 bg-white/30"></div>
                                    <div className="flex items-center gap-2 text-[10px]">
                                        <span className="text-gray-400">マッチ:</span>
                                        <span className="text-white font-semibold">{debugInfo.score}</span>
                                    </div>
                                </>
                            )}

                        </div>
                    )}
                </div>

                {/* Download Modal */}
                {videoUrl && (
                    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="bg-white p-6 rounded-2xl max-w-lg w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
                                <span className="bg-green-100 text-green-600 p-1 rounded-full"><Video size={20} /></span>
                                録画が完了しました
                            </h3>
                            <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-6 shadow-inner">
                                <video src={videoUrl} controls className="w-full h-full" />
                            </div>
                            <div className="flex gap-3">
                                <a
                                    href={videoUrl}
                                    download="script-camera-video.webm"
                                    className="flex-1 flex justify-center items-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-xl font-bold transition shadow-md hover:shadow-lg"
                                >
                                    <Download size={20} /> 動画を保存
                                </a>
                                <button
                                    onClick={() => setVideoUrl(null)}
                                    className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
                                >
                                    閉じる
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;