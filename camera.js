/* ============================================================
   NEONFALL — camera.js
   Orbit camera + perspective projection + ground picking.
   World: X/Z on ground plane, Y up.
   ============================================================ */
'use strict';

class Camera {
  constructor() {
    this.tx = 0; this.ty = 0; this.tz = 0;   // orbit target
    this.yaw = -0.6;                          // radians
    this.pitch = 0.16;                        // radians above horizon
    this.dist = 78;
    this.fov = 48 * DEG;

    this.tyaw = this.yaw; this.tpitch = this.pitch; this.tdist = this.dist;
    this.ttx = this.tx; this.ttz = this.tz; this.tty = this.ty;

    this.px = 0; this.py = 0; this.pz = 0;    // resolved position
    this.rx = 1; this.ry = 0; this.rz = 0;    // right basis
    this.ux = 0; this.uy = 1; this.uz = 0;    // up basis
    this.fx = 0; this.fy = 0; this.fz = 1;    // forward basis
    this.f = 1;                               // focal length in px
    this.w = 1; this.h = 1; this.cx = 0; this.cy = 0;
    this.shakeAmt = 0;
  }

  /* smooth toward targets */
  update(dt) {
    // never let a bad input value poison the view permanently
    if (!isFinite(this.tyaw) || !isFinite(this.tpitch) || !isFinite(this.tdist) ||
      !isFinite(this.ttx) || !isFinite(this.ttz) || !isFinite(this.tty)) {
      this.tyaw = isFinite(this.yaw) ? this.yaw : -0.7;
      this.tpitch = isFinite(this.pitch) ? this.pitch : 0.14;
      this.tdist = isFinite(this.dist) ? this.dist : 160;
      this.ttx = isFinite(this.tx) ? this.tx : 0;
      this.ttz = isFinite(this.tz) ? this.tz : 0;
      this.tty = isFinite(this.ty) ? this.ty : 30;
    }
    const k = 1 - Math.pow(0.0016, dt);
    this.yaw += wrapAngle(this.tyaw - this.yaw) * k;
    this.pitch += (this.tpitch - this.pitch) * k;
    this.dist += (this.tdist - this.dist) * k;
    this.tx += (this.ttx - this.tx) * k;
    this.ty += (this.tty - this.ty) * k;
    this.tz += (this.ttz - this.tz) * k;
  }

  setViewport(w, h) {
    this.w = w; this.h = h; this.cx = w * 0.5; this.cy = h * 0.5;
    this.f = (h * 0.5) / Math.tan(this.fov * 0.5);
  }

  /* recompute position + basis vectors; call once per frame before projecting */
  bake() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // forward points from camera toward target
    this.fx = cp * sy; this.fy = -sp; this.fz = cp * cy;
    this.px = this.tx - this.fx * this.dist;
    this.py = this.ty - this.fy * this.dist;
    this.pz = this.tz - this.fz * this.dist;
    // right = normalize(cross(worldUp, forward)) with worldUp = (0,1,0)
    this.rx = cy; this.ry = 0; this.rz = -sy;
    // up = cross(forward, right)
    this.ux = this.fy * this.rz - this.fz * this.ry;
    this.uy = this.fz * this.rx - this.fx * this.rz;
    this.uz = this.fx * this.ry - this.fy * this.rx;
  }

  /* world -> camera space {x right, y up, z depth} */
  toCam(x, y, z, out) {
    const dx = x - this.px, dy = y - this.py, dz = z - this.pz;
    out.x = dx * this.rx + dy * this.ry + dz * this.rz;
    out.y = dx * this.ux + dy * this.uy + dz * this.uz;
    out.z = dx * this.fx + dy * this.fy + dz * this.fz;
    return out;
  }

  /* camera space -> screen px */
  toScreen(c, out) {
    const iz = this.f / c.z;
    out.x = this.cx + c.x * iz;
    out.y = this.cy - c.y * iz;
    out.z = c.z;
    return out;
  }

  project(x, y, z, out) {
    const t = _camTmp;
    this.toCam(x, y, z, t);
    return this.toScreen(t, out || {});
  }

  /* screen px -> point on horizontal plane y = planeY (null if it misses) */
  screenToGround(sx, sy, planeY) {
    planeY = planeY || 0;
    const ndx = (sx - this.cx) / this.f;
    const ndy = -(sy - this.cy) / this.f;
    const dx = this.fx + this.rx * ndx + this.ux * ndy;
    const dy = this.fy + this.ry * ndx + this.uy * ndy;
    const dz = this.fz + this.rz * ndx + this.uz * ndy;
    if (Math.abs(dy) < 1e-6) return null;
    const t = (planeY - this.py) / dy;
    if (t <= 0) return null;
    return { x: this.px + dx * t, y: planeY, z: this.pz + dz * t, t: t };
  }

  /* screen px -> normalized world ray */
  ray(sx, sy) {
    const ndx = (sx - this.cx) / this.f;
    const ndy = -(sy - this.cy) / this.f;
    let dx = this.fx + this.rx * ndx + this.ux * ndy;
    let dy = this.fy + this.ry * ndx + this.uy * ndy;
    let dz = this.fz + this.rz * ndx + this.uz * ndy;
    const l = Math.hypot(dx, dy, dz) || 1;
    return { ox: this.px, oy: this.py, oz: this.pz, dx: dx / l, dy: dy / l, dz: dz / l };
  }

  /* pan in the camera's ground-plane frame */
  pan(dxRight, dzForward) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.ttx += dxRight * cy + dzForward * sy;
    this.ttz += -dxRight * sy + dzForward * cy;
  }

  zoomBy(f) { this.tdist = clamp(this.tdist * f, 8, 340); }

  clampTarget(r) {
    const d = Math.hypot(this.ttx, this.ttz);
    if (d > r) { this.ttx = this.ttx / d * r; this.ttz = this.ttz / d * r; }
    this.tpitch = clamp(this.tpitch, -0.08, 1.32);
    this.tty = clamp(this.tty, 0, 90);
  }
}

const _camTmp = { x: 0, y: 0, z: 0 };
