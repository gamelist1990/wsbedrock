import {
    debugDrawer,
    DebugArrow,
    DebugBox,
    DebugCircle,
    DebugLine,
    DebugShape,
    DebugSphere,
    DebugText
} from "@minecraft/debug-utilities";

import { type Vector3, type RGB, system } from "@minecraft/server";

/**
 * 汎用デバッグ描画ユーティリティ
 */
export class DebugDraw {
    /**
     * 線分を描画
     * @param start 始点座標
     * @param end 終点座標
     * @param color 線の色（RGB）
     * @param duration 秒（省略可）
     * @param size 中心基準で拡大するサイズ（新機能、線の太さ）
     */
    static line(start: Vector3, end: Vector3, color?: RGB, duration?: number, size?: number) {
        const line = new DebugLine({ x: start.x, y: start.y, z: start.z }, { x: end.x, y: end.y, z: end.z });
        if (color) line.color = { red: color.red, green: color.green, blue: color.blue };
        if (size) line.scale = size;
        if (duration && typeof duration === "number" && duration > 0) {
            system.runTimeout(() => DebugDraw.remove(line), duration * 20);
        }
        debugDrawer.addShape(line);
        return line;
    }

    /**
     * 矢印を描画
     * @param start 始点座標
     * @param end 終点座標
     * @param color 矢印の色（RGB）
     * @param duration 秒（省略可）
     * @param headLength 矢印の頭の長さ
     * @param headRadius 矢印の頭の半径
     * @param size 中心基準で拡大するサイズ（新機能、矢印全体の太さ）
     */
    static arrow(start: Vector3, end: Vector3, color?: RGB, duration?: number, headLength?: number, headRadius?: number, size?: number) {
        const arrow = new DebugArrow({ x: start.x, y: start.y, z: start.z }, { x: end.x, y: end.y, z: end.z });
        if (color) arrow.color = { red: color.red, green: color.green, blue: color.blue };
        if (headLength) arrow.headLength = headLength;
        if (headRadius) arrow.headRadius = headRadius;
        if (size) arrow.scale = size;
        if (duration && typeof duration === "number" && duration > 0) {
            system.runTimeout(() => DebugDraw.remove(arrow), duration * 20);
        }
        debugDrawer.addShape(arrow);
        return arrow;
    }

    /**
     * ボックス（立方体）を描画
     * @param center 中心座標
     * @param bound 既存のbound（従来通り）
     * @param color 色
     * @param scale 右下基準で拡大（従来通り）
     * @param duration 秒
     * @param size 中心基準で拡大するサイズ（新機能）
     */
    static box(center: Vector3, bound: Vector3, color?: RGB, scale?: number, duration?: number, size?: Vector3) {
        const box = new DebugBox({ x: center.x, y: center.y, z: center.z });
        // 新機能: sizeが指定された場合はboundにsizeをそのまま設定
        if (size) {
            box.bound = { x: size.x, y: size.y, z: size.z };
        } else {
            box.bound = { x: bound.x, y: bound.y, z: bound.z };
        }
        if (color) box.color = { red: color.red, green: color.green, blue: color.blue };
        if (scale) box.scale = scale;
        if (duration && typeof duration === "number" && duration > 0) {
            system.runTimeout(() => DebugDraw.remove(box), duration * 20);
        }
        debugDrawer.addShape(box);
        return box;
    }

    /**
     * 円（2D）を描画
     * @param center 中心座標
     * @param color 色
     * @param scale 右下基準で拡大（従来通り）
     * @param duration 秒
     * @param size 中心基準で拡大する半径（新機能）
     */
    static circle(center: Vector3, color?: RGB, scale?: number, duration?: number, size?: number) {
        const circle = new DebugCircle({ x: center.x, y: center.y, z: center.z });
        if (color) circle.color = { red: color.red, green: color.green, blue: color.blue };
        if (scale) circle.scale = scale;
        // sizeはscaleに割り当て（APIにradiusがないため）
        if (size) circle.scale = size;
        if (duration && typeof duration === "number" && duration > 0) {
            system.runTimeout(() => DebugDraw.remove(circle), duration * 20);
        }
        debugDrawer.addShape(circle);
        return circle;
    }

    /**
     * 球（3D）を描画
     * @param center 中心座標
     * @param color 色
     * @param scale 右下基準で拡大（従来通り）
     * @param duration 秒
     * @param size 中心基準で拡大する半径（新機能）
     */
    static sphere(center: Vector3, color?: RGB, scale?: number, duration?: number, size?: number) {
        const sphere = new DebugSphere({ x: center.x, y: center.y, z: center.z });
        if (color) sphere.color = { red: color.red, green: color.green, blue: color.blue };
        if (scale) sphere.scale = scale;
        // sizeはscaleに割り当て（APIにradiusがないため）
        if (size) sphere.scale = size;
        if (duration && typeof duration === "number" && duration > 0) {
            system.runTimeout(() => DebugDraw.remove(sphere), duration * 20);
        }
        debugDrawer.addShape(sphere);
        return sphere;
    }

    /**
     * テキストラベルを描画
     * @param position 表示座標
     * @param text 表示する文字列
     * @param color 色
     * @param scale 拡大率
     * @param duration 秒
     * @param size 文字サイズ（新機能）
     */
    static text(position: Vector3, text: string, color?: RGB, scale?: number, duration?: number, size?: number) {
        const label = new DebugText({ x: position.x, y: position.y, z: position.z }, text);
        if (color) label.color = { red: color.red, green: color.green, blue: color.blue };
        if (scale) label.scale = scale;
        // sizeはscaleに割り当て（APIにsizeがないため）
        if (size) label.scale = size;
        if (duration && typeof duration === "number" && duration > 0) {
            system.runTimeout(() => DebugDraw.remove(label), duration * 20); // 1秒 = 20ティック
        }
        debugDrawer.addShape(label);
        return label;
    }

    /**
     * 全てのデバッグ図形を削除
     */
    static clear() {
        debugDrawer.removeAll();
    }

    /**
     * 個別図形を削除
     */

    static remove(shape: DebugShape) {
        system.run(() => debugDrawer.removeShape(shape));
    }
}


