"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as faceapi from "@vladmandic/face-api";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  Loader2,
  Smartphone,
  BookOpen,
  Users,
  EyeOff,
  Monitor,
  Laptop,
  AlertTriangle,
} from "lucide-react";

export default function ProctoringPage() {

  // --------- State ---------
  const [candidateName, setCandidateName] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [alerts, setAlerts] = useState<{ message: string; timestamp: string }[]>([]);
  const [showReportButton, setShowReportButton] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // ---------- Refs ----------
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const detectionRequestRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const faceModelLoadedRef = useRef<boolean>(false);
  const objectModelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  const lastFaceTimeRef = useRef<number>(Date.now());
  const NO_FACE_INTERVAL = 10_000;

  // Javascript native refs for timings and counters
  const startTimeRef = useRef<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const focusLostCountRef = useRef<number>(0);
  const multipleFacesCountRef = useRef<number>(0);
  const objectAlertTypesRef = useRef<Set<string>>(new Set());

  const lastAlertTimesRef = useRef<{[cls: string]: number}>({});

  // Audio analysis refs
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioDataArrayRef = useRef<Uint8Array | null>(null);

  const ELECTRONIC_CLASSES = ["cell phone", "laptop", "computer"];

  // --------- Effects ---------
  useEffect(() => {
    if (isRecording) {
      startWebcam();
      startTimeRef.current = Date.now();
      focusLostCountRef.current = 0;
      multipleFacesCountRef.current = 0;
      objectAlertTypesRef.current.clear();
      lastAlertTimesRef.current = {};
      setAlerts([]);
      setShowReportButton(false);
    }
    return () => {
      stopDetectionLoop();
      stopAudioMonitoring();
    };
  }, [isRecording]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording && startTimeRef.current) {
      interval = setInterval(() => {
        setElapsed(
          Math.floor((Date.now() - (startTimeRef.current || 0)) / 1000)
        );
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // --------- Handlers and Functions ---------

  const startWebcam = async () => {
    try {
      setIsLoadingSession(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      if (!audioAnalyserRef.current && audioContextRef.current) {
        audioAnalyserRef.current = audioContextRef.current.createAnalyser();
        audioAnalyserRef.current.fftSize = 2048;
      }
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length && audioContextRef.current && audioAnalyserRef.current) {
        audioSourceRef.current = audioContextRef.current.createMediaStreamSource(new MediaStream(audioTracks));
        audioSourceRef.current.connect(audioAnalyserRef.current);
        audioDataArrayRef.current = new Uint8Array(audioAnalyserRef.current.frequencyBinCount);
      }

      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.start();

      await loadFaceModel();
      await loadObjectDetectionModel();

      prepareDetectionCanvas();
      if (objectModelRef.current && canvasRef.current) {
        await objectModelRef.current.detect(canvasRef.current);
      }

      startDetectionLoop();
    } catch (err) {
      console.error("Error accessing webcam or microphone:", err);
      addAlert("Webcam or microphone access denied or error.");
    } finally {
      setIsLoadingSession(false);
    }
  };

  const stopAudioMonitoring = () => {
    try {
      audioAnalyserRef.current?.disconnect();
      audioSourceRef.current?.disconnect();
      audioContextRef.current?.close();
    } catch {}
    audioAnalyserRef.current = null;
    audioSourceRef.current = null;
    audioContextRef.current = null;
    audioDataArrayRef.current = null;
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopDetectionLoop();
    stopAudioMonitoring();
    setIsRecording(false);
    setShowReportButton(true);
    endTimeRef.current = Date.now();
  };

  const loadFaceModel = async () => {
    if (!faceModelLoadedRef.current) {
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
      faceModelLoadedRef.current = true;
      console.log("Face and landmark models loaded");
    }
  };

  const loadObjectDetectionModel = async () => {
    if (!objectModelRef.current) {
      await tf.setBackend("webgl");
      await tf.ready();
      objectModelRef.current = await cocoSsd.load();
      console.log("Object detection model loaded");
    }
  };

  const prepareDetectionCanvas = () => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
    }
  };

  const startDetectionLoop = () => {
    detectionRequestRef.current = requestAnimationFrame(runDetection);
  };

  const stopDetectionLoop = () => {
    if (detectionRequestRef.current) {
      cancelAnimationFrame(detectionRequestRef.current);
      detectionRequestRef.current = null;
    }
  };

  const HALF_SECOND = 500;

  const runDetection = async () => {
    if (!isRecording || !videoRef.current || !objectModelRef.current) return;

    prepareDetectionCanvas();

    const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    const now = Date.now();

    if (!detections || detections.length === 0) {
      if (now - lastFaceTimeRef.current >= NO_FACE_INTERVAL) {
        addAlert("No face detected for >10 seconds");
        lastFaceTimeRef.current = now;
        focusLostCountRef.current++;
        objectAlertTypesRef.current.add("absence");
      }
    } else {
      lastFaceTimeRef.current = now;
      if (detections.length > 1) {
        if (!lastAlertTimesRef.current["multiple_faces"] || now - lastAlertTimesRef.current["multiple_faces"] > HALF_SECOND) {
          addAlert(`Multiple faces (${detections.length}) detected`);
          lastAlertTimesRef.current["multiple_faces"] = now;
          multipleFacesCountRef.current++;
          objectAlertTypesRef.current.add("multiple faces");
        }
      }
    }

    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);
    const objects = await objectModelRef.current.detect(canvasRef.current!);
    objects.forEach((obj) => {
      if (obj.score < 0.5) return;
      const cls = obj.class.toLowerCase();

      if (ELECTRONIC_CLASSES.includes(cls)) {
        if (!lastAlertTimesRef.current[cls] || now - lastAlertTimesRef.current[cls] > HALF_SECOND) {
          addAlert(`Electronic device (${cls}) detected`);
          lastAlertTimesRef.current[cls] = now;
          objectAlertTypesRef.current.add(cls);
        }
      }

      if (cls === "book" || cls === "paper") {
        if (!lastAlertTimesRef.current[cls] || now - lastAlertTimesRef.current[cls] > HALF_SECOND) {
          addAlert("Book/paper detected");
          lastAlertTimesRef.current[cls] = now;
          objectAlertTypesRef.current.add("notes");
        }
      }
    });

    detectionRequestRef.current = requestAnimationFrame(runDetection);
  };

  // Timer formatting helper
  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const getDuration = () => {
    if (!startTimeRef.current || !endTimeRef.current) return "0s";
    const diff = endTimeRef.current - startTimeRef.current;
    const seconds = Math.floor(diff / 1000) % 60;
    const minutes = Math.floor(diff / (1000 * 60)) % 60;
    const hours = Math.floor(diff / (1000 * 3600));
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  // Integrity score calculation
  const calcIntegrityScore = () => {
    let score = 100;

    if (objectAlertTypesRef.current.has("absence")) score -= 15;
    if (multipleFacesCountRef.current > 0) score -= multipleFacesCountRef.current * 20;
    if (objectAlertTypesRef.current.has("extra voice")) score -= 15;
    score -= focusLostCountRef.current * 5;

    alerts.forEach((alert) => {
      if (alert.message.toLowerCase().includes("cell phone")) score -= 10;
      if (alert.message.toLowerCase().includes("laptop")) score -= 10;
      if (alert.message.toLowerCase().includes("monitor")) score -= 10;
      if (alert.message.toLowerCase().includes("book") || alert.message.toLowerCase().includes("notes")) score -= 10;
    });

    return Math.max(0, Math.min(100, score));
  };

  // Add alert message with timestamp
  const addAlert = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setAlerts((prev) => [{ message, timestamp }, ...prev]);
  };

  // Store report data on backend
  const storeReportInDB = async () => {
    if (!candidateName.trim()) {
      console.warn("Candidate name required to store report");
      return;
    }
    const payload = {
      candidateName,
      startTime: startTimeRef.current,
      endTime: endTimeRef.current,
      focusLostCount: focusLostCountRef.current,
      multipleFacesCount: multipleFacesCountRef.current,
      objectAlertTypes: Array.from(objectAlertTypesRef.current),
      alerts,
      integrityScore: calcIntegrityScore(),
    };
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) console.error("Failed to store report:", data.error);
      else console.log("Report stored successfully");
    } catch (error) {
      console.error("Error storing report:", error);
    }
  };

  // Handle generate report button click
  const handleGenerateReportClick = async () => {
    setIsLoadingReport(true);
    try {
      generatePDFReport();
      await storeReportInDB();
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Generate multi-page PDF report
  const generatePDFReport = () => {
    const doc = new jsPDF();

    const PAGE_HEIGHT = doc.internal.pageSize.height;
    const MARGIN_TOP = 14;
    const MARGIN_BOTTOM = 20;
    const LINE_HEIGHT = 8;
    let y = 22;

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Proctoring Report", 14, y);
    y += 22;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Candidate Name:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${candidateName || "N/A"}`, 60, y);
    y += LINE_HEIGHT;

    doc.setFont("helvetica", "bold");
    doc.text("Interview Duration:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${getDuration()}`, 60, y);
    y += LINE_HEIGHT;

    doc.setFont("helvetica", "bold");
    doc.text("Focus Lost:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${focusLostCountRef.current} times`, 60, y);
    y += LINE_HEIGHT;

    const suspiciousEvents: string[] = [];
    if (multipleFacesCountRef.current > 0) suspiciousEvents.push("Multiple faces detected");
    if (objectAlertTypesRef.current.has("absence")) suspiciousEvents.push("Candidate absent");
    if (objectAlertTypesRef.current.has("cell phone")) suspiciousEvents.push("Mobile phone detected");
    if (objectAlertTypesRef.current.has("laptop")) suspiciousEvents.push("Laptop detected");
    if (objectAlertTypesRef.current.has("computer")) suspiciousEvents.push("Extra computer detected");
    if (objectAlertTypesRef.current.has("monitor")) suspiciousEvents.push("Extra monitor detected");
    if (objectAlertTypesRef.current.has("book") || objectAlertTypesRef.current.has("notes")) suspiciousEvents.push("Notes/book detected");
    if (objectAlertTypesRef.current.has("extra voice")) suspiciousEvents.push("Extra voice detected");

    doc.setFont("helvetica", "bold");
    doc.text("Suspicious Events:", 14, y);
    y += LINE_HEIGHT;
    doc.setFont("helvetica", "normal");

    if (suspiciousEvents.length === 0) {
      if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      doc.text("None detected", 20, y);
      y += LINE_HEIGHT;
    } else {
      for (const se of suspiciousEvents) {
        if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
          doc.addPage();
          y = MARGIN_TOP;
        }
        doc.text(`- ${se}`, 20, y);
        y += LINE_HEIGHT;
      }
    }

    if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Suspicious Activities Log:", 14, y);
    y += LINE_HEIGHT;
    doc.setFont("helvetica", "normal");

    if (alerts.length === 0) {
      if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      doc.text("No suspicious activities detected.", 20, y);
      y += LINE_HEIGHT;
    } else {
      if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      doc.setFont("helvetica", "bold");
      doc.text("Time", 20, y);
      doc.text("Activity", 60, y);
      y += LINE_HEIGHT;
      doc.setFont("helvetica", "normal");

      for (let i = alerts.length - 1; i >= 0; i--) {
        const alert = alerts[i];
        if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
          doc.addPage();
          y = MARGIN_TOP;
          doc.setFont("helvetica", "bold");
          doc.text("Time", 20, y);
          doc.text("Activity", 60, y);
          y += LINE_HEIGHT;
          doc.setFont("helvetica", "normal");
        }
        doc.text(alert.timestamp, 20, y);
        doc.text(alert.message, 60, y);
        y += LINE_HEIGHT;
      }
    }

    if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
    const score = calcIntegrityScore();
    let feedback = "";
    if (score > 90) feedback = "Excellent integrity maintained.";
    else if (score > 70) feedback = "Good, minor issues noticed.";
    else if (score > 50) feedback = "Fair, several concerns present.";
    else feedback = "Poor, high risk detected.";

    doc.setFont("helvetica", "bold");
    doc.text("Final Integrity Score:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${score} / 100 — ${feedback}`, 70, y);

    doc.save(`proctoring_report_${candidateName || "candidate"}.pdf`);
  };

  const handleStart = async () => {
    if (!candidateName.trim()) {
      alert("Please enter candidate name before starting the session.");
      return;
    }
    setIsLoadingSession(true);
    setIsRecording(true);
    setIsLoadingSession(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 relative">
      <div className="absolute right-6 top-6 flex items-center gap-2 bg-card px-4 py-2 rounded shadow text-lg font-mono z-10 border border-border">
        <span>⏱️</span>
        <span>{formatElapsed(elapsed)}</span>
      </div>

      <h1 className="text-3xl font-bold text-center mb-8 text-foreground">
        Video Proctoring System
      </h1>

      <div className="max-w-2xl mx-auto mb-6">
        <label className="block mb-2 font-semibold" htmlFor="candidateName">
          Candidate Name:
        </label>
        <input
          id="candidateName"
          type="text"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          placeholder="Enter candidate name"
          className="w-full border border-gray-300 rounded px-3 py-2"
          disabled={isRecording}
        />
      </div>

      <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto">
        <Card className="flex-1 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">Candidate Video</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center p-4">
            <div className="w-full aspect-video bg-muted rounded-md overflow-hidden mb-4">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            </div>
            <div className="flex gap-4">
              <Button
                onClick={handleStart}
                disabled={isRecording || isLoadingSession}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoadingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoadingSession ? "Starting..." : "Start Recording & Detection"}
              </Button>
              <Button
                onClick={stopWebcam}
                disabled={!isRecording}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Stop Session
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">Real-Time Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-[290px] overflow-y-auto border border-border rounded-md p-2 bg-muted">
              {alerts.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No alerts yet.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((alert, index) => {
                    let icon = <AlertTriangle className="inline w-4 h-4 mr-2 text-orange-500" />;
                    const msg = alert.message.toLowerCase();
                    if (msg.includes("cell phone") || msg.includes("mobile"))
                      icon = <Smartphone className="inline w-4 h-4 mr-2 text-blue-500" />;
                    else if (msg.includes("laptop"))
                      icon = <Laptop className="inline w-4 h-4 mr-2 text-blue-500" />;
                    else if (msg.includes("monitor") || msg.includes("computer"))
                      icon = <Monitor className="inline w-4 h-4 mr-2 text-blue-500" />;
                    else if (msg.includes("book") || msg.includes("paper") || msg.includes("notes"))
                      icon = <BookOpen className="inline w-4 h-4 mr-2 text-green-600" />;
                    else if (msg.includes("multiple faces"))
                      icon = <Users className="inline w-4 h-4 mr-2 text-purple-600" />;
                    else if (msg.includes("no face"))
                      icon = <EyeOff className="inline w-4 h-4 mr-2 text-gray-600" />;

                    return (
                      <li
                        key={index}
                        className="bg-orange-100 text-orange-800 border border-orange-200 p-3 rounded-md text-sm font-medium animate-in fade-in slide-in-from-top-2 flex items-center"
                      >
                        {icon}
                        <span className="mr-2">[{alert.timestamp}]</span> {alert.message}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {showReportButton && (
              <Button
                onClick={handleGenerateReportClick}
                disabled={isLoadingReport}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoadingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoadingReport ? "Generating..." : "Generate Report"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
