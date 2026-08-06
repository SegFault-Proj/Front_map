"""MVP floor-plan preprocessor. Returns candidates for human confirmation."""
import cv2
import numpy as np

def analyze_floorplan(image_path: str, roi=None) -> dict:
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError("도면 이미지를 불러올 수 없습니다.")
    if roi:
        x, y, w, h = [float(roi.get(key, 0)) for key in ('x', 'y', 'width', 'height')]
        height, width = image.shape[:2]
        x, y = max(0, int(x * width)), max(0, int(y * height))
        w, h = max(1, int(w * width)), max(1, int(h * height))
        image = image[y:min(height, y + h), x:min(width, x + w)]
    # Prefer the purple presentation layer for booths and facilities.
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    purple = cv2.inRange(hsv, np.array([125, 50, 80]), np.array([165, 255, 255]))
    purple = cv2.morphologyEx(purple, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=2)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    binary = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 8)
    edges = cv2.Canny(binary, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=50, maxLineGap=15)
    detected_lines = [] if lines is None else [dict(zip(('x1','y1','x2','y2'), map(int, line))) for line in lines[:, 0]]
    contours, hierarchy = cv2.findContours(purple if cv2.countNonZero(purple) > 0 else binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    spaces = []
    for contour in contours:
        area = cv2.contourArea(contour)
        image_area = image.shape[0] * image.shape[1]
        if area < max(300, image_area * 0.001) or area > image_area * 0.7:
            continue
        polygon = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
        ratio = max(cv2.boundingRect(contour)[2:]) / max(1, min(cv2.boundingRect(contour)[2:]))
        if ratio <= 15 and cv2.boundingRect(contour)[2] >= 35 and cv2.boundingRect(contour)[3] >= 20:
            spaces.append({'polygon': [[int(p[0][0]), int(p[0][1])] for p in polygon], 'area': float(area), 'confidence': 0.65, 'source': 'purple' if cv2.countNonZero(purple) > 0 else 'structural'})
    return {'width': int(image.shape[1]), 'height': int(image.shape[0]), 'lines': detected_lines, 'spaces': spaces}
