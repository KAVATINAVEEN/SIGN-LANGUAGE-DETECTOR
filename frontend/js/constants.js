// Shared constants for the frontend.

// MediaPipe hand landmark connections (21 bones), index pairs into the landmark array.
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                 // palm base
];

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Bundled demo images (one click loads them as the input source).
export const SAMPLES = [
  { letter: "Q", src: "assets/samples/sample_Q.jpg" },
  { letter: "T", src: "assets/samples/sample_T.jpg" },
  { letter: "E", src: "assets/samples/sample_E.jpg" },
  { letter: "G", src: "assets/samples/sample_G.jpg" },
  { letter: "P", src: "assets/samples/sample_P.jpg" },
  { letter: "L", src: "assets/samples/sample_L.jpg" },
  { letter: "Y", src: "assets/samples/sample_Y.jpg" },
  { letter: "M", src: "assets/samples/sample_M.jpg" },
];
