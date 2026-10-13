# Hilfsfunktionen des PyMuPDF-Wrappers (aus @bentopdf/pymupdf-wasm übernommen).
# Werden erst geladen, wenn ein Wrapper-Aufruf (Umwandeln, Begradigen …) sie braucht.
import pymupdf
import cv2
import numpy as np
pymupdf.TOOLS.store_shrink(100)

def repair_pdf(doc, save_path=None):
    """
    Repair a PDF by saving with garbage collection and reloading.
    This fixes corrupted cross-reference tables that cause 'cannot find object in xref' errors.
    If save_path is provided, saves the repaired PDF to that path (for use with pymupdf4llm).
    """
    repair_bytes = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    if save_path:
        with open(save_path, 'wb') as f:
            f.write(repair_bytes)
        return None
    return pymupdf.open("pdf", repair_bytes)

def detect_skew_hough(gray):
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=100, maxLineGap=10)
    
    if lines is None or len(lines) < 5:
        return None
    
    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if x2 - x1 == 0:
            continue
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) < 45:
            angles.append(angle)
    
    if len(angles) < 3:
        return None
    
    return np.median(angles)

def detect_skew_minarea(gray):
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(binary > 0))
    
    if len(coords) < 100:
        return None, 0
    
    rect = cv2.minAreaRect(coords)
    angle = rect[-1]
    
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90
    
    return -angle, len(coords)

def detect_skew_angle(img_array):
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_array
    
    angle_minarea, content_count = detect_skew_minarea(gray)
    
    if angle_minarea is not None and content_count > 1000 and abs(angle_minarea) > 0.1:
        return angle_minarea
    
    angle_hough = detect_skew_hough(gray)
    
    if angle_hough is not None and abs(angle_hough) > 0.1:
        return angle_hough
    
    if angle_minarea is not None:
        return angle_minarea
    
    return 0.0

def deskew_image(img_array, angle):
    h, w = img_array.shape[:2]
    center = (w // 2, h // 2)
    
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    
    cos_val = np.abs(M[0, 0])
    sin_val = np.abs(M[0, 1])
    new_w = int(h * sin_val + w * cos_val)
    new_h = int(h * cos_val + w * sin_val)
    
    M[0, 2] += (new_w - w) // 2
    M[1, 2] += (new_h - h) // 2
    
    if len(img_array.shape) == 3:
        border_color = (255, 255, 255)
    else:
        border_color = 255
    
    rotated = cv2.warpAffine(
        img_array, M, (new_w, new_h),
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border_color
    )
    return rotated
