"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as faceapi from "@vladmandic/face-api";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { Loader2 } from "lucide-react";

export default function ProctoringPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [alerts, setAlerts] = useState<{ message: string; timestamp: string }[]>([]);
  const [showReportButton, setShowReportButton] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const detectionRequestRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const faceModelLoadedRef = useRef<boolean>(false);
  const objectModelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  const lastFaceTimeRef = useRef<number>(Date.now());
  const NO_FACE_INTERVAL = 10_000;

  // Stats
  const startTimeRef = useRef<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const focusLostCountRef = useRef<number>(0);
  const multipleFacesCountRef = useRef<number>(0);
  const objectAlertTypesRef = useRef<Set<string>>(new Set());

  const lastAlertTimesRef = useRef<{ [cls: string]: number }>({});

  const ELECTRONIC_CLASSES = ["cell phone", "laptop", "computer"];

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
    };
  }, [isRecording]);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
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
      console.error("Error accessing webcam:", err);
      addAlert("Webcam access denied or error.");
    }
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
    setIsRecording(false);
    setShowReportButton(true);
    endTimeRef.current = Date.now();
  };

  const loadFaceModel = async () => {
    if (!faceModelLoadedRef.current) {
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      faceModelLoadedRef.current = true;
      console.log("Face model loaded");
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

    const faces = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions());
    const now = Date.now();

    if (!faces || faces.length === 0) {
      if (now - lastFaceTimeRef.current >= NO_FACE_INTERVAL) {
        addAlert(`No face detected for >10 seconds`);
        lastFaceTimeRef.current = now;
        focusLostCountRef.current += 1;
        objectAlertTypesRef.current.add("absence");
      }
    } else {
      lastFaceTimeRef.current = now;
      if (faces.length > 1) {
        if (!lastAlertTimesRef.current["multiple_faces"] || now - lastAlertTimesRef.current["multiple_faces"] > HALF_SECOND) {
          addAlert(`Multiple faces (${faces.length}) detected`);
          lastAlertTimesRef.current["multiple_faces"] = now;
          multipleFacesCountRef.current += 1;
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
          addAlert(`Book/paper detected`);
          lastAlertTimesRef.current[cls] = now;
          objectAlertTypesRef.current.add("notes");
        }
      }
    });

    detectionRequestRef.current = requestAnimationFrame(runDetection);
  };

  const getDuration = () => {
    if (!startTimeRef.current || !endTimeRef.current) return "0s";
    let diff = endTimeRef.current - startTimeRef.current;
    const seconds = Math.floor(diff / 1000) % 60;
    const minutes = Math.floor(diff / (1000 * 60)) % 60;
    const hours = Math.floor(diff / (1000 * 3600));
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const calcIntegrityScore = () => {
    let score = 100;

    if (objectAlertTypesRef.current.has("absence")) {
      score -= 15;
    }

    if (multipleFacesCountRef.current > 0) {
      score -= multipleFacesCountRef.current * 20;
    }

    score -= focusLostCountRef.current * 5;

    alerts.forEach((alert) => {
      if (alert.message.toLowerCase().includes("cell phone")) score -= 10;
      if (alert.message.toLowerCase().includes("laptop")) score -= 10;
      if (alert.message.toLowerCase().includes("monitor")) score -= 10;
      if (alert.message.toLowerCase().includes("book") || alert.message.toLowerCase().includes("notes")) score -= 10;
    });

    return Math.max(0, Math.min(100, score));
  };

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
      if (!data.success) {
        console.error("Failed to store report:", data.error);
      } else {
        console.log("Report stored successfully");
      }
    } catch (error) {
      console.error("Error storing report:", error);
    }
  };

 const handleGenerateReportClick = async () => {
  setIsLoadingReport(true);
  try {
    generatePDFReport();

    storeReportInDB().catch((err) => {
      console.error("DB store failed:", err);
    });
  } catch (err) {
    console.error("Unexpected error:", err);
  } finally {
    setIsLoadingReport(false);
  }
};


  const generatePDFReport = () => {
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Proctoring Report", 14, 22);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Candidate Name:", 14, 40);
    doc.setFont("helvetica", "normal");
    doc.text(`${candidateName || "N/A"}`, 60, 40);

    doc.setFont("helvetica", "bold");
    doc.text("Interview Duration:", 14, 48);
    doc.setFont("helvetica", "normal");
    doc.text(`${getDuration()}`, 60, 48);

    doc.setFont("helvetica", "bold");
    doc.text("Focus Lost:", 14, 56);
    doc.setFont("helvetica", "normal");
    doc.text(`${focusLostCountRef.current} times`, 60, 56);

    const suspiciousEvents: string[] = [];
    if (multipleFacesCountRef.current > 0) suspiciousEvents.push("Multiple faces detected");
    if (objectAlertTypesRef.current.has("absence")) suspiciousEvents.push("Candidate absent");
    if (objectAlertTypesRef.current.has("cell phone")) suspiciousEvents.push("Mobile phone detected");
    if (objectAlertTypesRef.current.has("laptop")) suspiciousEvents.push("Laptop detected");
    if (objectAlertTypesRef.current.has("computer")) suspiciousEvents.push("Extra computer detected");
    if (objectAlertTypesRef.current.has("monitor")) suspiciousEvents.push("Extra monitor detected");
    if (objectAlertTypesRef.current.has("book") || objectAlertTypesRef.current.has("notes")) suspiciousEvents.push("Notes/book detected");

    doc.setFont("helvetica", "bold");
    doc.text("Suspicious Events:", 14, 70);
    doc.setFont("helvetica", "normal");

    if (suspiciousEvents.length === 0) {
      doc.text("None detected", 20, 78);
    } else {
      suspiciousEvents.forEach((event, i) => {
        doc.text(`- ${event}`, 20, 78 + i * 8);
      });
    }

    const logStartY = 90 + suspiciousEvents.length * 8;
    doc.setFont("helvetica", "bold");
    doc.text("Suspicious Activities Log:", 14, logStartY);
    doc.setFont("helvetica", "normal");

    if (alerts.length === 0) {
      doc.text("No suspicious activities detected.", 20, logStartY + 8);
    } else {
      doc.setFont("helvetica", "bold");
      doc.text("Time", 20, logStartY + 8);
      doc.text("Activity", 60, logStartY + 8);
      doc.setFont("helvetica", "normal");

      alerts.slice().reverse().forEach((alert, i) => {
        doc.text(alert.timestamp, 20, logStartY + 16 + i * 8);
        doc.text(alert.message, 60, logStartY + 16 + i * 8);
      });
    }

    const score = calcIntegrityScore();
    let feedback = "";
    if (score > 90) feedback = "Excellent integrity maintained.";
    else if (score > 70) feedback = "Good, minor issues noticed.";
    else if (score > 50) feedback = "Fair, several concerns present.";
    else feedback = "Poor, high risk detected.";

    const scoreY = logStartY + 24 + Math.max(alerts.length, 1) * 8;
    doc.setFont("helvetica", "bold");
    doc.text("Final Integrity Score:", 14, scoreY);
    doc.setFont("helvetica", "normal");
    doc.text(`${score} / 100  — ${feedback}`, 70, scoreY);

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

  const addAlert = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setAlerts((prev) => [{ message, timestamp }, ...prev]);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <h1 className="text-3xl font-bold text-center mb-8 text-foreground">Video Proctoring System</h1>

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
              <Button onClick={handleStart} disabled={isRecording || isLoadingSession} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isLoadingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoadingSession ? "Starting..." : "Start Recording & Detection"}
              </Button>
              <Button onClick={stopWebcam} disabled={!isRecording} className="bg-red-600 hover:bg-red-700 text-white">
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
                  {alerts.map((alert, index) => (
                    <li
                      key={index}
                      className="bg-orange-100 text-orange-800 border border-orange-200 p-3 rounded-md text-sm font-medium animate-in fade-in slide-in-from-top-2"
                    >
                      [{alert.timestamp}] {alert.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {showReportButton && (
              <Button onClick={handleGenerateReportClick} disabled={isLoadingReport} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white">
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
