import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Mic, Video, Square, Download, Settings, RefreshCcw, Type, Monitor, AlertCircle, Upload, Youtube, Info, MessageSquare, ChevronDown, Keyboard } from 'lucide-react';

const App = () => {
    // --- State Management ---
    const [script, setScript] = useState("こんにちは。これは「台本読めるカメラ」の最終調整版です。\n\n「認識は合っているのに進まない」という問題を解決するため、マッチングロジックを「あいまい検索」に置き換えました。\n\nこれまでは一文字でも違うと止まってしまいましたが、新しいロジックでは「文章の類似度」を見ています。\n\n例えば、「スクリプトとの参照」を「スクリプトの参照」と言い間違えても、AIが「だいたい合っている」と判断して先に進みます。\n\nこれで、認識揺れや読み間違いによるストレスが大幅に減るはずです。\n\nさあ、もう一度試してみてください。");
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

    // --- Speech Recognition Setup ---
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'ja-JP';

            recognition.onstart = () => {
                isRecognizingRef.current = true;
                setErrorMessage(null);
            };

            recognition.onend = () => {
                isRecognizingRef.current = false;
                if (isRecording) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.log("Recognition auto-restart failed:", e);
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
                if (event.error === 'no-speech') return;
                if (event.error === 'audio-capture') {
                    setErrorMessage("マイク競合エラー: カメラとマイクを再起動してください。");
                    setIsRecording(false);
                } else if (event.error === 'not-allowed') {
                    setErrorMessage("マイク権限がありません。");
                }
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

    // --- Ultra-Robust Fuzzy Matching Logic ---
    // --- Ultra-Robust Fuzzy Matching Logic ---
    const findMatchInScript = (spokenText) => {
        if (!spokenText || spokenText.length < 2) return;

        // 無視する文字のパターン（正規化とインデックス復元で共通化）
        // 記号、括弧、空白、改行などを網羅的に除外
        const IGNORE_CHARS_PATTERN = /[、。！？\s\n「」『』・（）()\[\]…―\-~～!?,.]/g;

        // ヘルパー: 文字列の類似度を計算する (Jaccard係数風の簡易版)
        // 2つの文字列に含まれる共通文字の割合を返す
        const calculateSimilarity = (str1, str2) => {
            if (!str1 || !str2) return 0;
            const s1 = str1.split('');
            const s2 = str2.split('');
            let matchCount = 0;
            // 順序をある程度意識しつつ、文字が含まれているかチェック
            let searchIndex = 0;
            for (let char of s1) {
                const foundIndex = s2.indexOf(char, searchIndex);
                if (foundIndex !== -1) {
                    matchCount++;
                    searchIndex = foundIndex + 1; // 文字順序を守る
                }
            }
            // 長さに対する一致率
            return (matchCount * 2) / (s1.length + s2.length);
        };

        // 1. 基本的な正規化
        const normalize = (str) => str.replace(IGNORE_CHARS_PATTERN, "");
        const extractKana = (str) => str.replace(/[^ぁ-んァ-ンー]/g, "");

        // 直近の発話内容（少し長めに取る）
        const recentSpoken = spokenText.slice(-50);
        const cleanRecentSpoken = normalize(recentSpoken);
        const kanaRecentSpoken = extractKana(recentSpoken);

        // 検索範囲（現在地から先へ）
        const searchStart = Math.max(0, matchedIndex - 5);
        const searchEnd = Math.min(script.length, matchedIndex + 250);
        const targetScriptSlice = script.slice(searchStart, searchEnd);

        // --- ロジック: スライディングウィンドウでの類似度判定 ---
        // 台本の上を「窓」を滑らせながら、最近の発話との類似度を測る

        let bestMatchIndex = -1;
        let maxScore = 0;

        // A. 漢字込みの通常テキストでスキャン
        const cleanTargetScript = normalize(targetScriptSlice);

        // ウィンドウサイズ：5文字〜12文字
        // これくらいの長さのフレーズが、最近の発話の中に「だいたい」含まれているかを探す
        for (let i = 0; i < cleanTargetScript.length - 4; i++) {
            // 短いフレーズから長いフレーズまで試す
            const windowSizes = [5, 8, 12];

            for (let size of windowSizes) {
                if (i + size > cleanTargetScript.length) continue;

                const chunk = cleanTargetScript.substr(i, size);

                // 完全一致ではなく、類似度を見る
                // 「台本のこの部分(chunk)」が「発話の末尾(cleanRecentSpoken)」に含まれているか？
                // ただし includes ではなく類似度で

                // 高速化のため、まず末尾に含まれているか単純チェック
                // あるいは、発話の「最後の方」と比較する

                // ここではシンプルに「発話全体」に対して「台本チャンク」がどれくらいマッチするか見る
                // 発話テキストが長い場合、チャンクが含まれている可能性が高い

                // chunkの文字が recentSpoken にどれだけ含まれているか（順序考慮）
                const score = calculateSimilarity(chunk, cleanRecentSpoken);

                // 閾値: 80%以上一致していれば候補とする
                // 例: "スクリプトの参照" (chunk) vs "スクリプトとの参照" (spoken) -> 高スコア
                if (score > 0.75) {
                    // スコアが高い、かつ 長いマッチを優先
                    // さらに、現在地に近いほうを優先するための重み付け (iが小さいほうが良いが、マッチ長さを優先)
                    const weightedScore = score * size;

                    if (weightedScore > maxScore) {
                        maxScore = weightedScore;
                        bestMatchIndex = i + size; // マッチしたフレーズの「終わり」の位置
                    }
                }
            }
        }

        // B. もし通常マッチが微妙なら、ひらがなモードで再スキャン（救済措置）
        // 漢字の変換ミス（方 vs ほう）対策
        if (maxScore < 4) { // 基準値低め
            const kanaTargetScript = extractKana(targetScriptSlice);

            for (let i = 0; i < kanaTargetScript.length - 4; i++) {
                const size = 6; // カナの場合は少し長めで固定
                if (i + size > kanaTargetScript.length) continue;
                const chunk = kanaTargetScript.substr(i, size);
                const score = calculateSimilarity(chunk, kanaRecentSpoken);

                if (score > 0.8) {
                    const weightedScore = score * size * 0.9; // カナマッチは少し評価を下げる（誤爆防止）
                    if (weightedScore > maxScore) {
                        maxScore = weightedScore;
                        // カナインデックスなので後でマッピングが必要だが、
                        // ここではフラグを立てておき、後で専用のマッピングを行う
                        bestMatchIndex = -2; // 特殊フラグ
                    }
                }
            }
        }


        // --- 結果の適用 ---
        if (bestMatchIndex > -1) {
            // Aパターンの適用: cleanScript上のインデックスを元のscriptに戻す
            let currentCleanIndex = 0;
            let originalIndex = searchStart;

            while (originalIndex < script.length) {
                // 正規化で消える文字以外をカウント
                // 共通のパターンを使って判定
                if (script[originalIndex].replace(IGNORE_CHARS_PATTERN, "").length > 0) {
                    if (currentCleanIndex === bestMatchIndex) break;
                    currentCleanIndex++;
                }
                originalIndex++;
            }

            // 進む場合のみ更新
            if (originalIndex > matchedIndex) {
                setMatchedIndex(originalIndex);
            }
        }
        else if (bestMatchIndex === -2) {
            // Bパターン（カナ救済）の適用: カナだけで強引に進める
            // 精度は落ちるが「止まる」よりマシ
            // 現在地から少し進める（カナマッチの詳細位置計算は複雑なので簡易的に進める）
            // 実際は、直近のカナを見つけてそこにジャンプするのが理想

            // ここでは簡易的に「認識した長さ分」だけ検索範囲内でカナを探して進める
            // 本来はマッピングすべきだが、UX優先で「少し進める」
            setMatchedIndex(prev => Math.min(script.length, prev + 5));
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
            if (recognitionRef.current && !isRecognizingRef.current) {
                try { recognitionRef.current.start(); } catch (e) { }
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
                    className={`transition-colors duration-200 ${isRead
                            ? 'text-red-600 font-bold drop-shadow-sm'
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
                            <div className="inline-block w-full max-w-4xl bg-white/70 backdrop-blur-md px-8 py-8 rounded-2xl shadow-sm border border-white/50 pointer-events-none">
                                {renderedContent}
                            </div>
                        </div>
                    )}

                    {/* Realtime Recognition Subtitles & Help */}
                    {cameraActive && (
                        <div className="absolute bottom-28 right-4 z-30 flex flex-col gap-2 items-end">

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