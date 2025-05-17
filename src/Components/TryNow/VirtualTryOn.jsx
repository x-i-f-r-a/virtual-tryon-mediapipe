import React, { useRef, useEffect, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import {getImageRotationAngle, drawHalfImage } from "../../utils/util"
import { FaSpinner } from "react-icons/fa";

const VirtualTryOn = ({ category, image }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayImageRef = useRef(null);

  const handLandmarkerRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const poseLandmarkerRef = useRef(null);

  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);



  useEffect(() => {
    const loadImage = (src, ref) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Loop over all pixels
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Check if pixel is close to white
          if (r > 240 && g > 240 && b > 240) {
            data[i + 3] = 0; // Set alpha to 0 (transparent)
          }
        }

        ctx.putImageData(imageData, 0, 0);

        const transparentImg = new Image();
        transparentImg.src = canvas.toDataURL("image/png");
        transparentImg.onload = () => {
          ref.current = transparentImg;
        };
        transparentImg.onerror = () =>
          console.log("Failed to process image transparency.");
      };

      img.onerror = () => console.log(`Failed to load image from ${src}`);
      img.src = src;
    };

    if (category && image) {
      loadImage(image, overlayImageRef);
    } else {
      setError("Missing category or image.");
    }
  }, [category, image]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    let animationFrameId;

    async function setup() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: "/model/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7,
          }
        );

        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: "/model/face_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            outputFaceBlendshapes: false,
          }
        );

        poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: "/model/pose_landmarker_full.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            minPoseDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }
        );

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });

        videoRef.current.srcObject = stream;
        await new Promise(
          (resolve) => (videoRef.current.onloadedmetadata = () => resolve(true))
        );
        await videoRef.current.play();

        setIsLoading(false);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;

        const toPixel = (landmark, w, h) => ({
          x: w - landmark.x * w,
          y: landmark.y * h,
        });

        async function render() {
          const video = videoRef.current;
          const overlayImage = overlayImageRef.current;

          // Check if video and canvas context are ready
          if (
            !video ||
            video.readyState < 2 || // HAVE_CURRENT_DATA
            video.videoWidth === 0 ||
            video.videoHeight === 0
          ) {
            animationFrameId = requestAnimationFrame(render);
            return;
          }

          const w = canvas.width;
          const h = canvas.height;

          ctx.clearRect(0, 0, w, h);

          // Flip canvas for mirror effect
          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, w, h);
          ctx.restore();

          const timestamp = performance.now();

          let handResults = null;
          let faceResults = null;
          let poseResults = null;

          try {
            if (handLandmarkerRef.current) {
              handResults = await handLandmarkerRef.current.detectForVideo(
                video,
                timestamp
              );
            }

            if (faceLandmarkerRef.current) {
              faceResults = await faceLandmarkerRef.current.detectForVideo(
                video,
                timestamp
              );
            }

            if (poseLandmarkerRef.current) {
              poseResults = await poseLandmarkerRef.current.detectForVideo(
                video,
                timestamp
              );
            }
          } catch (error) {
            console.error("Landmarker detection error:", error);
            animationFrameId = requestAnimationFrame(render);
            return;
          }

          if (!overlayImage) {
            animationFrameId = requestAnimationFrame(render);
            return;
          }

          // === RING ===
          if (
            (category?.includes("ring") || category?.includes("rings")) &&
            handResults?.landmarks?.length > 0
          ) {
            for (const landmarks of handResults.landmarks) {
              const ringPIP = toPixel(landmarks[14], w, h);
              const ringDIP = toPixel(landmarks[15], w, h);
              const ringSide = toPixel(landmarks[17], w, h);
              const ringMCP = toPixel(landmarks[13], w, h);

              const upVecX = ringDIP.x - ringPIP.x;
              const upVecY = ringDIP.y - ringPIP.y;
              const upLen = Math.hypot(upVecX, upVecY);
              const upNormX = upVecX / upLen;
              const upNormY = upVecY / upLen;

              const forwardVecX = ringPIP.x - ringMCP.x;
              const forwardVecY = ringPIP.y - ringMCP.y;
              const forwardLen = Math.hypot(forwardVecX, forwardVecY);
              const forwardNormX = forwardVecX / forwardLen;
              const forwardNormY = forwardVecY / forwardLen;

              const centerX =
                (ringPIP.x + ringDIP.x) / 2 - upNormX * 10 - forwardNormX * 8;
              const centerY =
                (ringPIP.y + ringDIP.y) / 2 - upNormY * 10 - forwardNormY * 8;

              const angle =
                Math.atan2(ringDIP.y - ringPIP.y, ringDIP.x - ringPIP.x) -
                Math.PI / 2;

              const fingerWidth = Math.hypot(
                ringMCP.x - ringSide.x,
                ringMCP.y - ringSide.y
              );
              const ringWidth = fingerWidth * 1.4;
              const ringHeight = ringWidth * 0.6;

              const angleOffset = getImageRotationAngle(overlayImage); // should be cached after image loads

              ctx.save();
              ctx.translate(centerX, centerY);
              ctx.rotate(angle - angleOffset);

              ctx.beginPath();

              // Draw the full ellipse (ring)
              ctx.ellipse(
                0,
                0,
                ringWidth / 2,
                ringHeight / 2,
                0,
                0,
                2 * Math.PI
              );

              // Draw the back side polygon to *exclude* that area
              // This polygon covers the back part to be clipped out
              // ctx.moveTo(ringWidth / 2, 0);
              // ctx.lineTo(ringWidth * 0.55, 1);
              // ctx.lineTo(-ringWidth * 0.55, 1);
              // ctx.lineTo(-ringWidth / 2, 0);

              // // Use the 'evenodd' fill rule to clip everything except the polygon area
              // ctx.clip("evenodd");

              // Draw the ring image
              ctx.drawImage(
                overlayImage,
                -ringWidth / 2,
                -ringHeight / 2,
                ringWidth,
                ringHeight
              );

              ctx.restore();
            }
          }

          // === BANGLE ===
          if (
            (category?.includes("bracelets") ||
              category?.includes("bracelet")) &&
            handResults?.landmarks?.length > 0
          ) {
            for (const landmarks of handResults.landmarks) {
              const wristCenter = toPixel(landmarks[0], w, h);
              const wristLeft = toPixel(landmarks[5], w, h); // base of index finger
              const wristRight = toPixel(landmarks[17], w, h); // base of pinky finger

              const wristWidth = Math.hypot(
                wristLeft.x - wristRight.x,
                wristLeft.y - wristRight.y
              );

              const bangleWidth = wristWidth * 1.2; // slightly wider
              const bangleHeight = bangleWidth * 0.5;

              ctx.save();
              ctx.translate(wristCenter.x, wristCenter.y);
              ctx.drawImage(
                overlayImage,
                -bangleWidth / 2,
                -bangleHeight / 2,
                bangleWidth,
                bangleHeight
              );
              ctx.restore();
            }
          }

          // === NECKLACE ===
          if (
            (category?.includes("necklace") ||
              category?.includes("necklaces")) &&
            poseResults?.landmarks?.length > 0
          ) {
            const pose = poseResults.landmarks[0];

            // Landmarks indices from MediaPipe Pose:
            const leftShoulder = pose[11];
            const rightShoulder = pose[12];

            // Convert normalized landmarks to pixel coordinates
            const left = toPixel(leftShoulder, w, h);
            const right = toPixel(rightShoulder, w, h);

            // Calculate center point between shoulders
            const centerX = (left.x + right.x) / 2;
            const centerY = (left.y + right.y) / 2;

            // Calculate shoulder width
            const shoulderWidth = Math.hypot(
              right.x - left.x,
              right.y - left.y
            );

            // Necklace size relative to shoulder width
            const necklaceWidth = shoulderWidth * 0.7;
            const necklaceHeight = necklaceWidth * 0.5;

            // Adjust vertical position to move necklace up by 15% of shoulderWidth
            const offsetY = shoulderWidth * 0.2;

            ctx.drawImage(
              overlayImage,
              centerX - necklaceWidth / 2,
              centerY - offsetY, // shifted up
              necklaceWidth,
              necklaceHeight
            );
          }

          // === EARRING ===
          if (
            (category?.includes("earring") || category?.includes("earrings")) &&
            faceResults?.faceLandmarks?.length > 0
          ) {
            const face = faceResults.faceLandmarks[0];

            const leftEar = toPixel(face[234], w, h);
            const rightEar = toPixel(face[454], w, h);
            const nose = toPixel(face[1], w, h);

            const earDistance = rightEar.x - leftEar.x;
            const centerX = (leftEar.x + rightEar.x) / 2;
            const yaw = (nose.x - centerX) / earDistance;

            // If yaw > 0.3, head is turned to the left
            // If yaw < -0.3, head is turned to the right
            const isLeftEarVisible = yaw < 0.3;
            const isRightEarVisible = yaw > -0.3;

            const size = earDistance * 0.28;

            const offsetX = 4;
            const offsetY = 20;

            if (isLeftEarVisible) {
              drawHalfImage({
                ctx,
                image: overlayImage,
                side: "right",
                targetX: rightEar.x - size / 2 - offsetX,
                targetY: rightEar.y - size / 2 + offsetY,
                targetWidth: size,
                targetHeight: size,
              });
            }

            if (isRightEarVisible) {
              drawHalfImage({
                ctx,
                image: overlayImage,
                side: "left",
                targetX: leftEar.x - size / 2 + offsetX,
                targetY: leftEar.y - size / 2 + offsetY,
                targetWidth: size,
                targetHeight: size,
              });
            }
          }

          animationFrameId = requestAnimationFrame(render);
        }

        render();
      } catch (err) {
        console.error(err);
        setError("Failed to initialize camera or models.");
        setIsLoading(false);
      }
    }

    setup();

    return () => {
      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current?.close();
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [category]);

  return (
    <div style={{ margin: "0 auto", padding: "10px" }}>
      {isLoading && (
        <p className="flex flex-row gap-2 items-center text-pink-700 text-center p-1 my-1 bg-pink-100 rounded-md">
          <FaSpinner className="animate-spin text-pink-600" />
          Loading...
        </p>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div
        style={{
          position: "relative",
          paddingTop: "56.25%",
          backgroundColor: "#000",
          minHeight: "300px",
          width: "100%",
        }}
      >
        <video
          ref={videoRef}
          style={{ display: "none" }}
          playsInline
          muted
          className="min-h-[400px] w-full"
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      <p style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>
        Hold your hand or face up to the camera to try on virtual jewelry.
      </p>
    </div>
  );
};

export default VirtualTryOn;
