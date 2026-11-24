import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BuildingCell,
  GameScreenState,
  GameState,
  RecruitCandidate,
} from '../game/types';
import {
  CITY_GRID,
  CLUB_HALF_D,
  CLUB_HALF_W,
  CLUB_WORLD_POS,
  CUSTOMER_NAMES,
  OUTFIT_CATALOG,
  gridToWorld,
} from '../game/worldData';
import {
  CharacterRig,
  CityBuildResult,
  animateCharacterRig,
  buildCityWorld,
  createCharacterRig,
  createNameplateSprite,
  createVehicleGroup,
  updateNameplateSprite,
} from './models';
import { createProceduralTextures } from './textures';
import { soundEngine } from './audio';
import {
  AABBBox,
  VEHICLE_LANE_OFFSET,
  VehicleSimState,
  collidesWithBoxes,
  computeRoomApplauseVolume,
  computeRoomNavigationTarget,
  dirToYaw,
  findClearStreetSpawn,
  getVehicleAABB,
  moveActorWithCollisions,
  pickStreetWaypoint,
  stepVehicleActor,
} from '../game/npcNavigation';

export interface NearbyInteraction {
  type: 'recruit' | 'club_pc' | 'building' | 'gang' | 'boss';
  id: string;
  label: string;
  sublabel?: string;
}

export interface SceneCallbacks {
  onSimulationTick: (dt: number) => void;
  onPlayerInteract: (interaction: NearbyInteraction) => void;
  onPlayerAttack: () => void;
  onPlayerDodge: () => void;
  onHudSync: (info: {
    playerX: number;
    playerZ: number;
    insideClub: boolean;
    nearby: NearbyInteraction | null;
  }) => void;
}

interface RoamingActor {
  rig: CharacterRig;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
  walkPhase: number;
  pauseTimer?: number;
}

interface CustomerActor extends RoamingActor {
  name: string;
  assignedRoomId: string | null;
  nameplate: THREE.Sprite;
}

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

export class CitySceneManager {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private textures: ReturnType<typeof createProceduralTextures>;
  private city: CityBuildResult;

  private playerRig: CharacterRig;
  private playerPos = new THREE.Vector3(CLUB_WORLD_POS.x, 0.12, CLUB_WORLD_POS.z + CLUB_HALF_D + 2.8);
  private playerYaw = Math.PI; // Facing North (-Z) toward glowing Number One Club entrance!
  private playerWalkPhase = 0;
  private playerAttackTimer = 0;

  private camYaw = 0;
  private camPitch = 0.42;
  private camDistance = 10.5;
  private camCurrentPos = new THREE.Vector3(CLUB_WORLD_POS.x, 8, CLUB_WORLD_POS.z + 24);
  private camLookTarget = new THREE.Vector3(CLUB_WORLD_POS.x, 1.8, CLUB_WORLD_POS.z);
  private cameraTrauma = 0;
  private hitstopTimer = 0;

  private keysPressed = new Set<string>();
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private screenStateRef: GameScreenState = 'title';
  private gameStateRef: GameState;
  private callbacks: SceneCallbacks;

  private recruitMeshes = new Map<
    string,
    {
      rig: CharacterRig;
      candidate: RecruitCandidate;
      x: number;
      z: number;
      targetX: number;
      targetZ: number;
      speed: number;
      walkPhase: number;
      pauseTimer: number;
    }
  >();
  private employeeMeshes = new Map<
    string,
    { rig: CharacterRig; x: number; z: number; phase: number; nameplate: THREE.Sprite }
  >();
  private guardMeshes = new Map<string, CharacterRig>();
  private citizenActors: RoamingActor[] = [];
  private policeActors: RoamingActor[] = [];
  private customerActors: CustomerActor[] = [];
  private gangMeshes: CharacterRig[] = [];
  private bossRig: CharacterRig | null = null;
  private bossTelegraphRing: THREE.Mesh;

  private vehicles: Array<{ sim: VehicleSimState; mesh: THREE.Group; isPolice: boolean }> = [];
  private vehicleColliders: AABBBox[] = [];
  private allColliders: AABBBox[] = [];
  private actorObstaclesScratch: Array<{ x: number; z: number; radius: number }> = [];
  private otherVehicleBoxesScratch: AABBBox[] = [];
  private roomDoorXsCache: number[] = [];
  private activeRoomPositionsScratch: Array<{ x: number; z: number }> = [];
  private applauseTimer = 1.2;
  private gangImpactTimer = 0;

  // Pooled InstancedMesh particles (zero GC)
  private particleMesh: THREE.InstancedMesh;
  private particles: Array<{
    active: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
  }> = [];

  private frameId = 0;
  private lastTime = performance.now();
  private hudSyncAccum = 0;
  private titleTime = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    initialGameState: GameState,
    callbacks: SceneCallbacks,
  ) {
    this.container = container;
    this.gameStateRef = initialGameState;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0c1021');
    this.scene.fog = new THREE.FogExp2('#0c1021', 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      56,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.2,
      260,
    );

    // Studio Environment Reflection (mandatory for PBR materials on all devices)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Balanced Warm Key + Cool Hemisphere Fill
    const hemiLight = new THREE.HemisphereLight('#60a5fa', '#1e1b2e', 0.72);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#fde68a', 1.45);
    keyLight.position.set(45, 75, 55);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 180;
      const d = 68;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    // Club warm neon accent light
    const clubLight = new THREE.PointLight('#f59e0b', 2.4, 28, 1.4);
    clubLight.position.set(CLUB_WORLD_POS.x, 4.2, CLUB_WORLD_POS.z + 2);
    this.scene.add(clubLight);

    // Build Procedural Textures & 5x5 City World
    this.textures = createProceduralTextures(
      this.isSoftwareGl ? 1 : this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.city = buildCityWorld(CITY_GRID, this.textures);
    this.scene.add(this.city.group);
    this.roomDoorXsCache = Array.from(this.city.clubInterior.roomDoors.values()).map((d) => d.baseX);

    // Player Character Rig
    this.playerRig = createCharacterRig('player', this.textures);
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.scene.add(this.playerRig.root);

    // Boss Telegraph Ring
    this.bossTelegraphRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.3, 28),
      new THREE.MeshBasicMaterial({
        color: '#ef4444',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      }),
    );
    this.bossTelegraphRing.rotation.x = -Math.PI / 2;
    this.bossTelegraphRing.visible = false;
    this.scene.add(this.bossTelegraphRing);

    // Pooled InstancedMesh Particles (48 slots)
    const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const pMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, 48);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    for (let i = 0; i < 48; i++) {
      this.particles.push({ active: false, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
      _mat4.makeTranslation(0, -50, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    // Initial roaming citizens, patrolling police, and moving solid vehicles
    this.initCitizens();
    this.initPolicePatrols();
    this.initVehicles();
    this.refreshDynamicColliders();
    this.syncActorsWithGameState(initialGameState);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.startLoop();
  }

  private initCitizens() {
    const colors = ['#64748b', '#0ea5e9', '#10b981', '#a855f7', '#eab308'];
    for (let i = 0; i < 14; i++) {
      const rig = createCharacterRig('citizen', this.textures, {
        baseColor: colors[i % colors.length],
        hairColor: i % 2 === 0 ? '#1c1917' : '#78350f',
      });
      const block = CITY_GRID[(i * 3) % CITY_GRID.length];
      const pos = gridToWorld(block.row, block.col);
      const clear = findClearStreetSpawn(pos.x + 14.5, pos.z + 14.5, 0.6, this.city.colliders);
      const wp = pickStreetWaypoint(clear.x, clear.z);
      rig.root.position.set(clear.x, 0.12, clear.z);
      this.scene.add(rig.root);
      this.citizenActors.push({
        rig,
        x: clear.x,
        z: clear.z,
        targetX: wp.x,
        targetZ: wp.z,
        speed: 2.1 + Math.random() * 0.7,
        walkPhase: Math.random() * 6,
      });
    }
  }

  private initVehicles() {
    const specs: Array<{
      id: string;
      color: string;
      isPolice: boolean;
      x: number;
      z: number;
      dir: 0 | 1 | 2 | 3;
      targetCoord: number;
      maxSpeed: number;
    }> = [
      {
        id: 'veh_taxi',
        color: '#eab308',
        isPolice: false,
        x: 0,
        z: -16 + VEHICLE_LANE_OFFSET,
        dir: 0,
        targetCoord: 16,
        maxSpeed: 7.2,
      },
      {
        id: 'veh_police',
        color: '#0f172a',
        isPolice: true,
        x: -16 + VEHICLE_LANE_OFFSET,
        z: 36,
        dir: 3,
        targetCoord: 16,
        maxSpeed: 8.2,
      },
      {
        id: 'veh_sedan',
        color: '#be123c',
        isPolice: false,
        x: 16 - VEHICLE_LANE_OFFSET,
        z: -38,
        dir: 1,
        targetCoord: -16,
        maxSpeed: 7.4,
      },
      {
        id: 'veh_coupe',
        color: '#10b981',
        isPolice: false,
        x: -32,
        z: 16 + VEHICLE_LANE_OFFSET,
        dir: 0,
        targetCoord: -16,
        maxSpeed: 6.8,
      },
      {
        id: 'veh_suv',
        color: '#475569',
        isPolice: false,
        x: 48 - VEHICLE_LANE_OFFSET,
        z: -28,
        dir: 1,
        targetCoord: -16,
        maxSpeed: 6.5,
      },
    ];

    for (const sp of specs) {
      const mesh = createVehicleGroup(sp.color, sp.isPolice);
      const yaw = dirToYaw(sp.dir);
      mesh.position.set(sp.x, 0, sp.z);
      mesh.rotation.y = yaw;
      this.scene.add(mesh);
      this.vehicles.push({
        isPolice: sp.isPolice,
        mesh,
        sim: {
          id: sp.id,
          x: sp.x,
          z: sp.z,
          yaw,
          dir: sp.dir,
          maxSpeed: sp.maxSpeed,
          currentSpeed: sp.maxSpeed * 0.6,
          targetCoord: sp.targetCoord,
          waitTimer: 0,
        },
      });
    }
  }

  private refreshDynamicColliders() {
    this.vehicleColliders.length = 0;
    this.allColliders.length = 0;
    for (let i = 0; i < this.city.colliders.length; i++) {
      this.allColliders.push(this.city.colliders[i]);
    }
    for (let i = 0; i < this.vehicles.length; i++) {
      const { sim } = this.vehicles[i];
      const box = getVehicleAABB(sim.x, sim.z, sim.yaw);
      this.vehicleColliders.push(box);
      this.allColliders.push(box);
    }
  }

  private initPolicePatrols() {
    const patrolStarts = [
      { x: 24, z: -16 },  // Number One Club avenue
      { x: -16, z: 16 },  // Police Station avenue
      { x: -16, z: -16 }, // Central commercial avenue
      { x: 48, z: -16 },  // East avenue near Mall & Cinema
    ];
    patrolStarts.forEach((pt, idx) => {
      const rig = createCharacterRig('police', this.textures);
      const clear = findClearStreetSpawn(pt.x, pt.z, 0.6, this.city.colliders);
      const wp = pickStreetWaypoint(clear.x, clear.z);
      rig.root.position.set(clear.x, 0.12, clear.z);
      this.scene.add(rig.root);
      this.policeActors.push({
        rig,
        x: clear.x,
        z: clear.z,
        targetX: wp.x,
        targetZ: wp.z,
        speed: 2.25 + (idx % 2) * 0.3,
        walkPhase: idx * 1.4,
        pauseTimer: 0,
      });
    });
  }

  public setScreenState(screen: GameScreenState) {
    this.screenStateRef = screen;
    if (screen !== 'playing') {
      this.keysPressed.clear();
    }
  }

  public updateGameState(state: GameState) {
    this.gameStateRef = state;
    this.syncActorsWithGameState(state);
  }

  public triggerCombatImpact(heavy = false, worldPos?: { x: number; z: number }) {
    this.cameraTrauma = Math.min(1, this.cameraTrauma + (heavy ? 0.55 : 0.3));
    if (heavy) {
      this.hitstopTimer = 0.045;
    }
    const px = worldPos?.x ?? this.playerPos.x;
    const pz = worldPos?.z ?? this.playerPos.z;
    this.spawnBurst(px, 1.3, pz, heavy ? 16 : 8);
  }

  public teleportPlayerToBuilding(buildingId: string) {
    const marker = this.city.entranceMarkers.get(buildingId);
    if (marker) {
      this.playerPos.set(marker.x, 0.12, marker.z);
      this.playerYaw = Math.PI;
      return;
    }
    const cell = CITY_GRID.find((c) => c.id === buildingId);
    if (cell) {
      const center = gridToWorld(cell.row, cell.col);
      this.playerPos.set(center.x, 0.12, center.z + 13);
      this.playerYaw = Math.PI;
    }
  }

  private spawnBurst(x: number, y: number, z: number, count: number) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        const ang = Math.random() * Math.PI * 2;
        const spd = 2.5 + Math.random() * 4.5;
        p.vx = Math.cos(ang) * spd;
        p.vy = 2.5 + Math.random() * 3.5;
        p.vz = Math.sin(ang) * spd;
        p.life = 0.45 + Math.random() * 0.25;
        spawned++;
      }
    }
  }

  private syncActorsWithGameState(state: GameState) {
    // 1. Recruitable Candidates
    const activeRecruitIds = new Set(state.recruitPool.map((r) => r.id));
    for (const [id, entry] of this.recruitMeshes.entries()) {
      if (!activeRecruitIds.has(id)) {
        this.scene.remove(entry.rig.root);
        this.recruitMeshes.delete(id);
      }
    }
    for (const cand of state.recruitPool) {
      if (!this.recruitMeshes.has(cand.id)) {
        const rig = createCharacterRig('recruitable', this.textures, cand.appearance);
        const clear = findClearStreetSpawn(cand.worldX, cand.worldZ, 0.6, this.city.colliders);
        const wp = pickStreetWaypoint(clear.x, clear.z);
        rig.root.position.set(clear.x, 0.12, clear.z);
        this.scene.add(rig.root);
        this.recruitMeshes.set(cand.id, {
          rig,
          candidate: cand,
          x: clear.x,
          z: clear.z,
          targetX: wp.x,
          targetZ: wp.z,
          speed: 1.85 + (this.recruitMeshes.size % 3) * 0.2,
          walkPhase: this.recruitMeshes.size * 1.1,
          pauseTimer: 0,
        });
      }
    }

    // 2. Hired Employees inside Number One Club
    const activeEmpIds = new Set(state.employees.map((e) => e.id));
    for (const [id, entry] of this.employeeMeshes.entries()) {
      if (!activeEmpIds.has(id)) {
        this.scene.remove(entry.rig.root);
        this.employeeMeshes.delete(id);
      }
    }
    state.employees.forEach((emp, idx) => {
      let entry = this.employeeMeshes.get(emp.id);
      if (!entry) {
        const rig = createCharacterRig('employee', this.textures, emp.appearance);
        const nameplate = createNameplateSprite(emp.fullDisplayName, '#f472b6');
        rig.root.add(nameplate);
        const startPos = this.city.clubInterior.danceFloorCenter;
        const ox = ((idx % 3) - 1) * 1.8;
        const oz = (Math.floor(idx / 3) - 0.5) * 1.8;
        rig.root.position.set(startPos.x + ox, 0.12, startPos.z + oz);
        this.scene.add(rig.root);
        entry = { rig, x: startPos.x + ox, z: startPos.z + oz, phase: idx * 1.1, nameplate };
        this.employeeMeshes.set(emp.id, entry);
      }
      // Sync equipped outfit color
      const outfit = OUTFIT_CATALOG.find((o) => o.id === emp.equippedOutfitId);
      if (outfit && entry.rig.outfitMesh.material instanceof THREE.MeshStandardMaterial) {
        entry.rig.outfitMesh.material.color.set(
          outfit.id === 'outfit_default' ? emp.appearance.baseColor : outfit.primaryColor,
        );
      }
      if (outfit && entry.rig.accentMesh?.material instanceof THREE.MeshStandardMaterial) {
        entry.rig.accentMesh.material.color.set(outfit.accentColor);
      }
    });

    // 3. Club Room Status Lights (door sliding handled smoothly in updateAmbientActors)
    for (const room of state.rooms) {
      const doorRef = this.city.clubInterior.roomDoors.get(room.id);
      if (doorRef) {
        const occupied = room.occupiedByEmployeeId !== null;
        const mat = doorRef.statusLight.material as THREE.MeshBasicMaterial;
        mat.color.set(!room.unlocked ? '#475569' : occupied ? '#ef4444' : '#22c55e');
      }
    }

    // 4. Club Customers (with floating head nameplates & room pairing)
    const occupiedRooms = state.rooms.filter((r) => r.occupiedByEmployeeId !== null);
    const targetCustCount =
      state.police.temporaryClosureHours > 0
        ? 0
        : Math.max(occupiedRooms.length, Math.min(8, state.activeCustomersCount));

    while (this.customerActors.length < targetCustCount) {
      const rig = createCharacterRig('customer', this.textures);
      const custName = CUSTOMER_NAMES[this.customerActors.length % CUSTOMER_NAMES.length];
      const nameplate = createNameplateSprite(custName, '#38bdf8');
      rig.root.add(nameplate);
      const lounge = this.city.clubInterior.waitingLoungeCenter;
      let cx = lounge.x + (Math.random() - 0.5) * 3.0;
      let cz = lounge.z - 0.6 + (Math.random() - 0.5) * 1.4;
      if (collidesWithBoxes(cx, cz, 0.45, this.city.colliders)) {
        cx = lounge.x;
        cz = lounge.z - 0.6;
      }
      rig.root.position.set(cx, 0.12, cz);
      this.scene.add(rig.root);
      this.customerActors.push({
        rig,
        x: cx,
        z: cz,
        targetX: cx,
        targetZ: cz,
        speed: 3.1,
        walkPhase: Math.random() * 5,
        name: custName,
        assignedRoomId: null,
        nameplate,
      });
    }
    while (this.customerActors.length > targetCustCount) {
      const removed = this.customerActors.pop()!;
      this.scene.remove(removed.rig.root);
    }

    // Pair one customer actor to each occupied service room & sync customer nameplate
    const occupiedRoomIds = new Set(occupiedRooms.map((r) => r.id));
    for (const cust of this.customerActors) {
      if (cust.assignedRoomId && !occupiedRoomIds.has(cust.assignedRoomId)) {
        cust.assignedRoomId = null;
      }
    }
    for (const occRoom of occupiedRooms) {
      let paired = this.customerActors.find((c) => c.assignedRoomId === occRoom.id);
      if (!paired) {
        paired = this.customerActors.find((c) => c.assignedRoomId === null);
        if (paired) {
          paired.assignedRoomId = occRoom.id;
        }
      }
      if (paired && occRoom.occupiedByCustomerName && paired.name !== occRoom.occupiedByCustomerName) {
        paired.name = occRoom.occupiedByCustomerName;
        updateNameplateSprite(paired.nameplate, paired.name, '#38bdf8');
      }
    }

    // 5. Security Guards at Club Entrance
    const activeGuardIds = new Set(state.guards.map((g) => g.id));
    for (const [id, rig] of this.guardMeshes.entries()) {
      if (!activeGuardIds.has(id)) {
        this.scene.remove(rig.root);
        this.guardMeshes.delete(id);
      }
    }
    state.guards.forEach((g, idx) => {
      if (!this.guardMeshes.has(g.id)) {
        const rig = createCharacterRig('guard', this.textures);
        const side = idx % 2 === 0 ? -2.8 : 2.8;
        const depth = Math.floor(idx / 2) * 1.8;
        rig.root.position.set(
          CLUB_WORLD_POS.x + side,
          0.12,
          CLUB_WORLD_POS.z + CLUB_HALF_D + 1.4 + depth,
        );
        this.scene.add(rig.root);
        this.guardMeshes.set(g.id, rig);
      }
    });

    // 6. Gang Attackers
    const neededGang = state.gangAttack.active
      ? state.gangAttack.enemiesRemaining
      : state.bossFight.active
      ? state.bossFight.minionsRemaining
      : 0;
    while (this.gangMeshes.length < neededGang) {
      const rig = createCharacterRig('gang', this.textures);
      const ang = (this.gangMeshes.length / Math.max(1, neededGang)) * Math.PI * 2;
      const rawX = CLUB_WORLD_POS.x + Math.cos(ang) * 7;
      const rawZ = CLUB_WORLD_POS.z + CLUB_HALF_D + 4.5 + Math.sin(ang) * 2.5;
      const clear = findClearStreetSpawn(rawX, rawZ, 0.55, this.allColliders.length > 0 ? this.allColliders : this.city.colliders);
      rig.root.position.set(clear.x, 0.12, clear.z);
      this.scene.add(rig.root);
      this.gangMeshes.push(rig);
    }
    while (this.gangMeshes.length > neededGang) {
      const rem = this.gangMeshes.pop()!;
      this.scene.remove(rem.root);
    }

    // 7. Boss Abraham Sweetvoice
    if (state.bossFight.active) {
      if (!this.bossRig) {
        this.bossRig = createCharacterRig('boss', this.textures);
        this.bossRig.root.position.set(
          CLUB_WORLD_POS.x,
          0.12,
          CLUB_WORLD_POS.z + CLUB_HALF_D + 7.5,
        );
        this.scene.add(this.bossRig.root);
      }
      this.bossTelegraphRing.visible = state.bossFight.telegraphTimer > 0;
      if (this.bossTelegraphRing.visible && this.bossRig) {
        this.bossTelegraphRing.position.set(
          this.bossRig.root.position.x,
          0.16,
          this.bossRig.root.position.z,
        );
        const pulse = 0.8 + Math.sin(performance.now() * 0.015) * 0.25;
        this.bossTelegraphRing.scale.setScalar(pulse);
      }
    } else if (this.bossRig) {
      this.scene.remove(this.bossRig.root);
      this.bossRig = null;
      this.bossTelegraphRing.visible = false;
    }
  }

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.screenStateRef !== 'playing') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const code = e.code;
    const wasDown = this.keysPressed.has(code);
    this.keysPressed.add(code);

    if (!wasDown) {
      if (code === 'KeyE') {
        const nearby = this.findNearestInteraction();
        if (nearby) this.callbacks.onPlayerInteract(nearby);
      } else if (code === 'KeyF') {
        this.triggerMeleeSwing();
      } else if (code === 'Space' && this.gameStateRef.bossFight.active) {
        e.preventDefault();
        this.callbacks.onPlayerDodge();
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysPressed.delete(e.code);
  };

  private onWindowBlur = () => {
    this.keysPressed.clear();
    this.isDragging = false;
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.keysPressed.clear();
      this.isDragging = false;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.screenStateRef !== 'playing') return;
    if (e.button === 0 && (this.gameStateRef.gangAttack.active || this.gameStateRef.bossFight.active)) {
      this.triggerMeleeSwing();
    }
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging || this.screenStateRef !== 'playing') return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    this.camYaw -= dx * 0.0055;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.004, 0.18, 1.05);
  };

  private onPointerUp = () => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.screenStateRef !== 'playing') return;
    this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * 0.006, 5.5, 19);
  };

  private triggerMeleeSwing() {
    this.playerAttackTimer = 0.28;
    if (this.playerRig.weaponMesh) {
      this.playerRig.weaponMesh.visible = true;
    }
    this.callbacks.onPlayerAttack();
  }

  private handleResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private isInsideNumberOneClub(): boolean {
    return (
      Math.abs(this.playerPos.x - CLUB_WORLD_POS.x) < CLUB_HALF_W - 0.5 &&
      Math.abs(this.playerPos.z - CLUB_WORLD_POS.z) < CLUB_HALF_D - 0.5
    );
  }

  private findNearestInteraction(): NearbyInteraction | null {
    // 1. Boss / Gang Attack priority when near club
    if (this.gameStateRef.bossFight.active && this.bossRig) {
      const dist = this.playerPos.distanceTo(this.bossRig.root.position);
      if (dist < 7.0) {
        return {
          type: 'boss',
          id: 'abraham_sweetvoice',
          label: '[F] / Tık: Abraham Sweetvoice ile Çatış',
          sublabel: '[Space] Kaçınma',
        };
      }
    }
    if (this.gameStateRef.gangAttack.active && this.gangMeshes.length > 0) {
      let minGangDist = Infinity;
      for (const rig of this.gangMeshes) {
        const d = this.playerPos.distanceTo(rig.root.position);
        if (d < minGangDist) minGangDist = d;
      }
      const distToClubFront = Math.hypot(
        this.playerPos.x - CLUB_WORLD_POS.x,
        this.playerPos.z - (CLUB_WORLD_POS.z + CLUB_HALF_D),
      );
      if (minGangDist < 12.0 || distToClubFront < 14.0) {
        return {
          type: 'gang',
          id: 'gang_raid',
          label: '[F] / Tık: Çete Saldırganlarına Müdahale Et',
          sublabel: 'Mekana saldırıyorlar · Saldırganları püskürt',
        };
      }
    }

    // 2. Management PC inside Number One Club
    if (this.playerPos.distanceTo(this.city.clubInterior.pcPosition) < 3.4) {
      return {
        type: 'club_pc',
        id: 'club_pc',
        label: '[E] İşletme Bilgisayarını Aç',
        sublabel: 'Number One Club Yönetim Paneli',
      };
    }

    // 3. Recruitable NPCs
    let closestRecruit: { id: string; name: string; sub: string; dist: number } | null = null;
    for (const [id, entry] of this.recruitMeshes.entries()) {
      const d = this.playerPos.distanceTo(entry.rig.root.position);
      if (d < 3.5 && (!closestRecruit || d < closestRecruit.dist)) {
        closestRecruit = {
          id,
          name: entry.candidate.fullDisplayName,
          sub: `Yaş ${entry.candidate.age} · Görüşme Başlat`,
          dist: d,
        };
      }
    }
    if (closestRecruit) {
      return {
        type: 'recruit',
        id: closestRecruit.id,
        label: `[E] ${closestRecruit.name} ile Konuş`,
        sublabel: closestRecruit.sub,
      };
    }

    // 4. Enterable City Buildings (except Number One Club which is seamlessly walked into)
    for (const [cellId, marker] of this.city.entranceMarkers.entries()) {
      if (cellId === 'number_one_club') continue;
      const d = this.playerPos.distanceTo(marker);
      if (d < 3.8) {
        const cell: BuildingCell | undefined = CITY_GRID.find((c) => c.id === cellId);
        if (cell) {
          return {
            type: 'building',
            id: cell.id,
            label: `[E] ${cell.name} Giriş`,
            sublabel: cell.subtitle,
          };
        }
      }
    }

    return null;
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      // Sub-step clamped dt so both GPU (60fps) and software WebGL (~10fps) run at full real-time pace without tunneling
      const totalDt = Math.min(Math.max(rawDt, 0.001), 0.16);
      let remaining = totalDt;
      while (remaining > 0.0001) {
        const step = Math.min(remaining, 0.04);
        this.update(step);
        remaining -= step;
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } catch {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private update(dt: number) {
    // Particles always tick in real dt
    this.updateParticles(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    // Title Screen Live World Flyover Camera — hovers over open avenue intersection facing Number One Club's glowing entrance
    if (this.screenStateRef === 'title') {
      this.titleTime += dt;
      const tx = 16.5 + Math.sin(this.titleTime * 0.25) * 3.5;
      const tz = -13.5 + Math.cos(this.titleTime * 0.25) * 2.5;
      this.camera.position.set(tx, 7.6 + Math.sin(this.titleTime * 0.4) * 0.6, tz);
      this.camera.lookAt(CLUB_WORLD_POS.x - 1.0, 3.2, CLUB_WORLD_POS.z + 6.0);
      this.city.clubInterior.roofGroup.visible = true;
      this.updateAmbientActors(dt);
      return;
    }

    if (this.screenStateRef !== 'playing') {
      return;
    }

    // Advance core game simulation
    this.callbacks.onSimulationTick(dt);

    // Player Movement
    let moveX = 0;
    let moveZ = 0;
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) moveZ -= 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) moveZ += 1;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) moveX -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) moveX += 1;

    const isMoving = moveX !== 0 || moveZ !== 0;
    const isSprinting = this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight');
    const speed = isSprinting ? 11.5 : 6.8;

    if (isMoving) {
      const len = Math.hypot(moveX, moveZ);
      moveX /= len;
      moveZ /= len;

      // Rotate input relative to camera yaw
      const sinY = Math.sin(this.camYaw);
      const cosY = Math.cos(this.camYaw);
      const worldDx = moveX * cosY + moveZ * sinY;
      const worldDz = -moveX * sinY + moveZ * cosY;

      const nextX = THREE.MathUtils.clamp(this.playerPos.x + worldDx * speed * dt, -76, 76);
      const nextZ = THREE.MathUtils.clamp(this.playerPos.z + worldDz * speed * dt, -76, 76);

      // Axis-separated AABB collision resolution against city buildings
      if (!this.collidesWithBuildings(nextX, this.playerPos.z)) {
        this.playerPos.x = nextX;
      }
      if (!this.collidesWithBuildings(this.playerPos.x, nextZ)) {
        this.playerPos.z = nextZ;
      }

      const targetYaw = Math.atan2(worldDx, worldDz);
      let diff = targetYaw - this.playerYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerYaw += diff * (1 - Math.exp(-12 * dt));
      this.playerWalkPhase += dt * (isSprinting ? 14 : 9.5);
    }

    if (this.playerAttackTimer > 0) {
      this.playerAttackTimer = Math.max(0, this.playerAttackTimer - dt);
      if (this.playerAttackTimer === 0 && this.playerRig.weaponMesh) {
        this.playerRig.weaponMesh.visible =
          this.gameStateRef.gangAttack.active || this.gameStateRef.bossFight.active;
      }
    }

    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;
    animateCharacterRig(
      this.playerRig,
      isMoving ? speed : 0,
      this.playerWalkPhase,
      this.playerAttackTimer > 0 ? 'attack' : isSprinting && isMoving ? 'run' : isMoving ? 'walk' : 'idle',
    );

    // Seamless Number One Club Interior Roof Toggle
    const insideClub = this.isInsideNumberOneClub();
    this.city.clubInterior.roofGroup.visible = !insideClub;

    // Rotating club dance spotlights
    this.city.clubInterior.danceSpots.forEach((spot, idx) => {
      spot.rotation.z = Math.sin(performance.now() * 0.002 + idx * 2) * 0.28;
    });

    // Update NPCs, Employees, Guards, Gang, Boss
    this.updateAmbientActors(dt);

    // Smooth Damped Third-Person Camera
    const targetDist = insideClub ? Math.min(this.camDistance, 8.2) : this.camDistance;
    const horizDist = Math.cos(this.camPitch) * targetDist;
    const vertDist = Math.sin(this.camPitch) * targetDist + (insideClub ? 1.8 : 1.0);

    _vecA.set(
      this.playerPos.x + Math.sin(this.camYaw) * horizDist,
      this.playerPos.y + vertDist,
      this.playerPos.z + Math.cos(this.camYaw) * horizDist,
    );
    _vecB.set(this.playerPos.x, this.playerPos.y + 1.55, this.playerPos.z);

    const damp = 1 - Math.exp(-9.5 * dt);
    this.camCurrentPos.lerp(_vecA, damp);
    this.camLookTarget.lerp(_vecB, damp);

    this.camera.position.copy(this.camCurrentPos);
    if (this.cameraTrauma > 0) {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.8);
    }
    this.camera.lookAt(this.camLookTarget);

    // Throttle React HUD sync to <= 8 Hz
    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.14) {
      this.hudSyncAccum = 0;
      const nearby = this.findNearestInteraction();
      this.callbacks.onHudSync({
        playerX: this.playerPos.x,
        playerZ: this.playerPos.z,
        insideClub,
        nearby,
      });
    }
  }

  private collidesWithBuildings(x: number, z: number): boolean {
    const boxes = this.allColliders.length > 0 ? this.allColliders : this.city.colliders;
    return collidesWithBoxes(x, z, 0.55, boxes);
  }

  private pickEvadeStreetWaypoint(x: number, z: number): { x: number; z: number } {
    const a = pickStreetWaypoint(x, z);
    const b = pickStreetWaypoint(x, z);
    const da = Math.hypot(a.x - CLUB_WORLD_POS.x, a.z - CLUB_WORLD_POS.z);
    const db = Math.hypot(b.x - CLUB_WORLD_POS.x, b.z - CLUB_WORLD_POS.z);
    return da >= db ? a : b;
  }

  private pickPatrolClubWaypoint(x: number, z: number): { x: number; z: number } {
    const a = pickStreetWaypoint(x, z);
    const b = pickStreetWaypoint(x, z);
    const clubFrontX = CLUB_WORLD_POS.x;
    const clubFrontZ = CLUB_WORLD_POS.z + CLUB_HALF_D + 4.8;
    const da = Math.hypot(a.x - clubFrontX, a.z - clubFrontZ);
    const db = Math.hypot(b.x - clubFrontX, b.z - clubFrontZ);
    return da <= db ? a : b;
  }

  private updateVehicles(dt: number) {
    if (this.vehicles.length === 0) return;

    this.actorObstaclesScratch.length = 0;
    if (this.screenStateRef === 'playing') {
      this.actorObstaclesScratch.push({ x: this.playerPos.x, z: this.playerPos.z, radius: 0.7 });
    }
    for (let i = 0; i < this.citizenActors.length; i++) {
      this.actorObstaclesScratch.push({ x: this.citizenActors[i].x, z: this.citizenActors[i].z, radius: 0.65 });
    }
    for (let i = 0; i < this.policeActors.length; i++) {
      this.actorObstaclesScratch.push({ x: this.policeActors[i].x, z: this.policeActors[i].z, radius: 0.65 });
    }
    for (const entry of this.recruitMeshes.values()) {
      this.actorObstaclesScratch.push({ x: entry.x, z: entry.z, radius: 0.65 });
    }
    for (let i = 0; i < this.gangMeshes.length; i++) {
      const p = this.gangMeshes[i].root.position;
      this.actorObstaclesScratch.push({ x: p.x, z: p.z, radius: 0.65 });
    }
    if (this.bossRig) {
      this.actorObstaclesScratch.push({
        x: this.bossRig.root.position.x,
        z: this.bossRig.root.position.z,
        radius: 0.75,
      });
    }

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      this.otherVehicleBoxesScratch.length = 0;
      for (let j = 0; j < this.vehicles.length; j++) {
        if (i === j) continue;
        const ov = this.vehicles[j].sim;
        this.otherVehicleBoxesScratch.push(getVehicleAABB(ov.x, ov.z, ov.yaw));
      }

      stepVehicleActor(
        v.sim,
        dt,
        this.actorObstaclesScratch,
        this.otherVehicleBoxesScratch,
      );

      v.mesh.position.set(v.sim.x, 0, v.sim.z);
      v.mesh.rotation.y = v.sim.yaw;
    }

    this.refreshDynamicColliders();
  }

  private updateAmbientActors(dt: number) {
    const panicMode = this.gameStateRef.gangAttack.active || this.gameStateRef.bossFight.active;
    const nowSec = performance.now() * 0.001;

    // 0. Update moving solid city vehicles and refresh combined collider list
    this.updateVehicles(dt);
    const navColliders = this.allColliders.length > 0 ? this.allColliders : this.city.colliders;

    // 1. Citizens roaming streets (never pass through walls or cars)
    for (const actor of this.citizenActors) {
      const spd = panicMode ? actor.speed * 1.7 : actor.speed;
      const prevX = actor.x;
      const prevZ = actor.z;
      const res = moveActorWithCollisions(
        actor.x,
        actor.z,
        actor.targetX,
        actor.targetZ,
        spd,
        dt,
        0.55,
        navColliders,
      );
      actor.x = res.x;
      actor.z = res.z;
      actor.rig.root.position.set(actor.x, 0.12, actor.z);

      if (res.reached || res.blocked) {
        const next = panicMode
          ? this.pickEvadeStreetWaypoint(actor.x, actor.z)
          : pickStreetWaypoint(actor.x, actor.z);
        actor.targetX = next.x;
        actor.targetZ = next.z;
      }

      if (res.movedDist > 0.002) {
        actor.rig.root.rotation.y = Math.atan2(actor.x - prevX, actor.z - prevZ);
        actor.walkPhase += dt * spd * 2.1;
        animateCharacterRig(actor.rig, spd, actor.walkPhase, panicMode ? 'run' : 'walk');
      } else {
        animateCharacterRig(actor.rig, 0, nowSec * 2, 'idle');
      }
    }

    // 2. Police officers patrolling city streets freely (never pass through walls or cars)
    for (const officer of this.policeActors) {
      if ((officer.pauseTimer ?? 0) > 0 && !panicMode) {
        officer.pauseTimer = Math.max(0, (officer.pauseTimer ?? 0) - dt);
        animateCharacterRig(officer.rig, 0, nowSec * 2, 'idle');
        continue;
      }

      const spd = panicMode ? officer.speed * 1.55 : officer.speed;
      const prevX = officer.x;
      const prevZ = officer.z;
      const res = moveActorWithCollisions(
        officer.x,
        officer.z,
        officer.targetX,
        officer.targetZ,
        spd,
        dt,
        0.55,
        navColliders,
      );
      officer.x = res.x;
      officer.z = res.z;
      officer.rig.root.position.set(officer.x, 0.12, officer.z);

      if (res.reached) {
        officer.pauseTimer = panicMode ? 0 : 0.6 + Math.random() * 1.1;
        const next = panicMode
          ? this.pickPatrolClubWaypoint(officer.x, officer.z)
          : pickStreetWaypoint(officer.x, officer.z);
        officer.targetX = next.x;
        officer.targetZ = next.z;
      } else if (res.blocked) {
        const next = panicMode
          ? this.pickPatrolClubWaypoint(officer.x, officer.z)
          : pickStreetWaypoint(officer.x, officer.z);
        officer.targetX = next.x;
        officer.targetZ = next.z;
      }

      if (res.movedDist > 0.002) {
        officer.rig.root.rotation.y = Math.atan2(officer.x - prevX, officer.z - prevZ);
        officer.walkPhase += dt * spd * 2.1;
        animateCharacterRig(officer.rig, spd, officer.walkPhase, panicMode ? 'run' : 'walk');
      } else {
        animateCharacterRig(officer.rig, 0, nowSec * 2, 'idle');
      }
    }

    // 3. Recruitable candidates roaming streets freely (pause & face player when close for interview)
    for (const entry of this.recruitMeshes.values()) {
      const distToPlayer = Math.hypot(this.playerPos.x - entry.x, this.playerPos.z - entry.z);
      if (this.screenStateRef === 'playing' && distToPlayer < 3.8 && !panicMode) {
        entry.rig.root.rotation.y = Math.atan2(this.playerPos.x - entry.x, this.playerPos.z - entry.z);
        animateCharacterRig(entry.rig, 0, nowSec * 2, 'idle');
      } else if (entry.pauseTimer > 0 && !panicMode) {
        entry.pauseTimer = Math.max(0, entry.pauseTimer - dt);
        animateCharacterRig(entry.rig, 0, nowSec * 2, 'idle');
      } else {
        const spd = panicMode ? entry.speed * 1.6 : entry.speed;
        const prevX = entry.x;
        const prevZ = entry.z;
        const res = moveActorWithCollisions(
          entry.x,
          entry.z,
          entry.targetX,
          entry.targetZ,
          spd,
          dt,
          0.55,
          navColliders,
        );
        entry.x = res.x;
        entry.z = res.z;

        if (res.reached) {
          entry.pauseTimer = panicMode ? 0 : 0.8 + Math.random() * 1.4;
          const next = panicMode
            ? this.pickEvadeStreetWaypoint(entry.x, entry.z)
            : pickStreetWaypoint(entry.x, entry.z);
          entry.targetX = next.x;
          entry.targetZ = next.z;
        } else if (res.blocked) {
          const next = panicMode
            ? this.pickEvadeStreetWaypoint(entry.x, entry.z)
            : pickStreetWaypoint(entry.x, entry.z);
          entry.targetX = next.x;
          entry.targetZ = next.z;
        }

        if (res.movedDist > 0.002) {
          entry.rig.root.rotation.y = Math.atan2(entry.x - prevX, entry.z - prevZ);
          entry.walkPhase += dt * spd * 2.1;
          animateCharacterRig(entry.rig, spd, entry.walkPhase, panicMode ? 'run' : 'walk');
        } else {
          animateCharacterRig(entry.rig, 0, nowSec * 2, 'idle');
        }
      }

      entry.rig.root.position.set(entry.x, 0.12, entry.z);
      if (entry.rig.indicatorRing) {
        entry.rig.indicatorRing.rotation.z = nowSec * 1.2;
      }
    }

    // 4. Club Employees inside Number One Club (enter hollow service rooms when in_room!)
    let idx = 0;
    for (const emp of this.gameStateRef.employees) {
      const entry = this.employeeMeshes.get(emp.id);
      if (!entry) continue;

      let goalX = this.city.clubInterior.danceFloorCenter.x + ((idx % 3) - 1) * 1.9;
      let goalZ = this.city.clubInterior.danceFloorCenter.z + (Math.floor(idx / 3) - 0.5) * 1.9;
      let mode: 'idle' | 'walk' | 'run' | 'dance' = 'dance';

      if (emp.state === 'in_saferoom') {
        goalX = this.city.clubInterior.safeRoomPosition.x + (idx % 2) * 1.2;
        goalZ = this.city.clubInterior.safeRoomPosition.z;
        mode = 'run';
      } else if (emp.state === 'in_room' && emp.assignedRoomId) {
        const doorRef = this.city.clubInterior.roomDoors.get(emp.assignedRoomId);
        if (doorRef) {
          goalX = CLUB_WORLD_POS.x + doorRef.baseX - 0.36;
          goalZ = CLUB_WORLD_POS.z - 8.25;
          mode = 'walk';
        }
      } else if (emp.state === 'resting') {
        goalX = this.city.clubInterior.waitingLoungeCenter.x + ((idx % 3) - 1) * 1.3;
        goalZ = this.city.clubInterior.waitingLoungeCenter.z - 0.45;
        mode = 'idle';
      }

      const nav = computeRoomNavigationTarget(
        entry.x,
        entry.z,
        goalX,
        goalZ,
        this.roomDoorXsCache,
        CLUB_WORLD_POS.x,
        CLUB_WORLD_POS.z,
      );

      const d = Math.hypot(goalX - entry.x, goalZ - entry.z);
      if (d > 0.35) {
        const moveSpd = mode === 'run' ? 6.5 : 3.5;
        const prevX = entry.x;
        const prevZ = entry.z;
        let res = moveActorWithCollisions(
          entry.x,
          entry.z,
          nav.tx,
          nav.tz,
          moveSpd,
          dt,
          0.33,
          navColliders,
        );
        // Only reroute via club center if outside the booth line and snagged on lounge furniture
        if (res.blocked && res.movedDist < 0.005 && entry.z > CLUB_WORLD_POS.z - 6.3) {
          res = moveActorWithCollisions(
            entry.x,
            entry.z,
            CLUB_WORLD_POS.x,
            CLUB_WORLD_POS.z + 1.0,
            moveSpd,
            dt,
            0.33,
            navColliders,
          );
        }
        entry.x = res.x;
        entry.z = res.z;
        if (res.movedDist > 0.002) {
          entry.rig.root.rotation.y = Math.atan2(entry.x - prevX, entry.z - prevZ);
          entry.phase += dt * 7;
          animateCharacterRig(entry.rig, moveSpd, entry.phase, mode === 'run' ? 'run' : 'walk');
        } else {
          entry.phase += dt * 3.5;
          animateCharacterRig(entry.rig, 0, entry.phase, mode === 'dance' ? 'dance' : 'idle');
        }
      } else {
        if (emp.state === 'in_room') {
          entry.rig.root.rotation.y = Math.atan2(0.72, -0.15);
        }
        entry.phase += dt * 3.5;
        animateCharacterRig(
          entry.rig,
          0,
          entry.phase,
          mode === 'dance' || emp.state === 'in_room' ? 'dance' : 'idle',
        );
      }
      entry.rig.root.position.set(entry.x, 0.12, entry.z);
      idx++;
    }

    // 5. Club Customers (enter assigned service room with employee, or wait/exit back to lounge)
    const lounge = this.city.clubInterior.waitingLoungeCenter;
    for (let ci = 0; ci < this.customerActors.length; ci++) {
      const cust = this.customerActors[ci];
      let goalX = lounge.x + ((ci % 3) - 1) * 2.15;
      let goalZ = lounge.z - 0.65 - Math.floor(ci / 3) * 1.25;

      if (cust.assignedRoomId) {
        const doorRef = this.city.clubInterior.roomDoors.get(cust.assignedRoomId);
        if (doorRef) {
          goalX = CLUB_WORLD_POS.x + doorRef.baseX + 0.36;
          goalZ = CLUB_WORLD_POS.z - 8.4;
        }
      }

      const nav = computeRoomNavigationTarget(
        cust.x,
        cust.z,
        goalX,
        goalZ,
        this.roomDoorXsCache,
        CLUB_WORLD_POS.x,
        CLUB_WORLD_POS.z,
      );

      const d = Math.hypot(goalX - cust.x, goalZ - cust.z);
      if (d > 0.35) {
        const moveSpd = cust.assignedRoomId ? 3.2 : 2.3;
        const prevX = cust.x;
        const prevZ = cust.z;
        let res = moveActorWithCollisions(
          cust.x,
          cust.z,
          nav.tx,
          nav.tz,
          moveSpd,
          dt,
          0.33,
          navColliders,
        );
        if (res.blocked && res.movedDist < 0.005 && cust.z > CLUB_WORLD_POS.z - 6.3) {
          res = moveActorWithCollisions(
            cust.x,
            cust.z,
            CLUB_WORLD_POS.x,
            CLUB_WORLD_POS.z + 1.0,
            moveSpd,
            dt,
            0.33,
            navColliders,
          );
        }
        cust.x = res.x;
        cust.z = res.z;
        if (res.movedDist > 0.002) {
          cust.rig.root.rotation.y = Math.atan2(cust.x - prevX, cust.z - prevZ);
          cust.walkPhase += dt * 6.5;
          animateCharacterRig(cust.rig, moveSpd, cust.walkPhase, 'walk');
        } else {
          cust.walkPhase += dt * 2.6;
          animateCharacterRig(cust.rig, 0, cust.walkPhase, 'idle');
        }
      } else {
        cust.rig.root.rotation.y = cust.assignedRoomId ? Math.atan2(-0.72, 0.15) : -2.4;
        cust.walkPhase += dt * 2.8;
        animateCharacterRig(cust.rig, 0, cust.walkPhase, 'idle');
      }
      cust.rig.root.position.set(cust.x, 0.12, cust.z);
    }

    // 5b. Smooth Room Door Open/Close & Spatial Applause Audio from Occupied Rooms
    const playerInside = this.isInsideNumberOneClub();
    this.activeRoomPositionsScratch.length = 0;

    for (const room of this.gameStateRef.rooms) {
      const doorRef = this.city.clubInterior.roomDoors.get(room.id);
      if (!doorRef) continue;

      const occupied = room.occupiedByEmployeeId !== null;
      const roomWorldX = CLUB_WORLD_POS.x + doorRef.baseX;
      const pairedEmp = room.occupiedByEmployeeId
        ? this.employeeMeshes.get(room.occupiedByEmployeeId)
        : undefined;
      const pairedCust = this.customerActors.find((c) => c.assignedRoomId === room.id);

      let someoneTransitioningDoor = false;
      let someoneInsideRoom = false;

      if (pairedEmp) {
        if (pairedEmp.z > CLUB_WORLD_POS.z - 7.15) someoneTransitioningDoor = true;
        if (pairedEmp.z <= CLUB_WORLD_POS.z - 6.8 && Math.abs(pairedEmp.x - roomWorldX) < 1.25) {
          someoneInsideRoom = true;
        }
      }
      if (pairedCust) {
        if (pairedCust.z > CLUB_WORLD_POS.z - 7.15) someoneTransitioningDoor = true;
        if (pairedCust.z <= CLUB_WORLD_POS.z - 6.8 && Math.abs(pairedCust.x - roomWorldX) < 1.25) {
          someoneInsideRoom = true;
        }
      }

      // Also keep door open while a freshly finished actor is still exiting this room
      let someoneExitingThisRoom = false;
      if (!occupied) {
        for (const empEntry of this.employeeMeshes.values()) {
          if (empEntry.z < CLUB_WORLD_POS.z - 6.1 && Math.abs(empEntry.x - roomWorldX) < 1.15) {
            someoneExitingThisRoom = true;
            break;
          }
        }
        if (!someoneExitingThisRoom) {
          for (const cust of this.customerActors) {
            if (cust.z < CLUB_WORLD_POS.z - 6.1 && Math.abs(cust.x - roomWorldX) < 1.15) {
              someoneExitingThisRoom = true;
              break;
            }
          }
        }
      }

      const doorShouldOpen =
        room.unlocked && (!occupied || someoneTransitioningDoor || someoneExitingThisRoom);
      const targetDoorX = doorShouldOpen ? doorRef.baseX + 0.95 : doorRef.baseX;
      doorRef.doorMesh.position.x +=
        (targetDoorX - doorRef.doorMesh.position.x) * Math.min(1, 7.5 * dt);

      if (occupied && someoneInsideRoom) {
        this.activeRoomPositionsScratch.push({ x: roomWorldX, z: CLUB_WORLD_POS.z - 8.5 });
      }
    }

    if (this.activeRoomPositionsScratch.length > 0 && this.screenStateRef === 'playing') {
      this.applauseTimer -= dt;
      if (this.applauseTimer <= 0) {
        this.applauseTimer = 2.4 + Math.random() * 1.1;
        const vol = computeRoomApplauseVolume(
          this.playerPos.x,
          this.playerPos.z,
          playerInside,
          this.activeRoomPositionsScratch,
        );
        if (vol > 0) {
          soundEngine.playApplause(vol);
          if (playerInside) {
            const roomSpot = this.activeRoomPositionsScratch[0];
            this.spawnBurst(roomSpot.x, 2.8, roomSpot.z, 2);
          }
        }
      }
    }

    // 6. Security Guards defending club entrance
    for (const rig of this.guardMeshes.values()) {
      if (this.gameStateRef.gangAttack.active && this.gangMeshes.length > 0) {
        let nearestGang = this.gangMeshes[0];
        let bestD = Infinity;
        for (const g of this.gangMeshes) {
          const gd = rig.root.position.distanceTo(g.root.position);
          if (gd < bestD) {
            bestD = gd;
            nearestGang = g;
          }
        }
        rig.root.rotation.y = Math.atan2(
          nearestGang.root.position.x - rig.root.position.x,
          nearestGang.root.position.z - rig.root.position.z,
        );
      } else {
        rig.root.rotation.y = 0;
      }
      animateCharacterRig(rig, 0, nowSec * 5, panicMode ? 'attack' : 'idle');
    }

    const doorway = this.city.clubInterior.entranceDoorwayPos;

    // 7. Gang Attackers: target Number One Club (the venue), NOT the player!
    if (this.gameStateRef.gangAttack.active) {
      let anyStrikingVenue = false;
      const count = this.gangMeshes.length;
      for (let gi = 0; gi < count; gi++) {
        const rig = this.gangMeshes[gi];
        const curX = rig.root.position.x;
        const curZ = rig.root.position.z;
        const spread = (gi - (count - 1) / 2) * 2.2;
        const breached = this.gameStateRef.gangAttack.clubDoorIntegrity <= 30 && Math.abs(spread) <= 2.3;
        const tx = CLUB_WORLD_POS.x + THREE.MathUtils.clamp(spread, -6.5, 6.5);
        const tz = breached
          ? CLUB_WORLD_POS.z + CLUB_HALF_D - 1.4
          : CLUB_WORLD_POS.z + CLUB_HALF_D + 1.15;

        const distToVenueSpot = Math.hypot(tx - curX, tz - curZ);
        if (distToVenueSpot > 0.85) {
          const res = moveActorWithCollisions(curX, curZ, tx, tz, 3.3, dt, 0.52, navColliders);
          rig.root.position.set(res.x, 0.12, res.z);
          if (res.movedDist > 0.002) {
            rig.root.rotation.y = Math.atan2(res.x - curX, res.z - curZ);
            animateCharacterRig(rig, 3.3, nowSec * 7 + gi, 'run');
          } else {
            // Up against venue wall -> strike the club!
            anyStrikingVenue = true;
            rig.root.rotation.y = Math.atan2(CLUB_WORLD_POS.x - curX, CLUB_WORLD_POS.z - curZ);
            animateCharacterRig(rig, 0, nowSec * 7 + gi, 'attack');
          }
        } else {
          anyStrikingVenue = true;
          rig.root.rotation.y = Math.atan2(CLUB_WORLD_POS.x - curX, CLUB_WORLD_POS.z - curZ);
          animateCharacterRig(rig, 0, nowSec * 7 + gi, 'attack');
        }
      }

      if (anyStrikingVenue) {
        this.gangImpactTimer += dt;
        if (this.gangImpactTimer >= 0.85) {
          this.gangImpactTimer = 0;
          this.spawnBurst(
            CLUB_WORLD_POS.x + (Math.random() - 0.5) * 4.2,
            1.3,
            CLUB_WORLD_POS.z + CLUB_HALF_D + 0.4,
            5,
          );
        }
      }
    } else {
      // Boss Fight minions engage around the club entrance / player
      for (const rig of this.gangMeshes) {
        const curX = rig.root.position.x;
        const curZ = rig.root.position.z;
        const distToPlayer = Math.hypot(this.playerPos.x - curX, this.playerPos.z - curZ);
        const actorInside =
          Math.abs(curX - CLUB_WORLD_POS.x) < CLUB_HALF_W - 0.5 &&
          Math.abs(curZ - CLUB_WORLD_POS.z) < CLUB_HALF_D - 0.5;
        const tx = playerInside && !actorInside ? doorway.x : this.playerPos.x;
        const tz = playerInside && !actorInside ? doorway.z - 2.2 : this.playerPos.z;

        if (distToPlayer > 2.4) {
          const res = moveActorWithCollisions(curX, curZ, tx, tz, 3.2, dt, 0.55, navColliders);
          rig.root.position.set(res.x, 0.12, res.z);
          if (res.movedDist > 0.002) {
            rig.root.rotation.y = Math.atan2(res.x - curX, res.z - curZ);
            animateCharacterRig(rig, 3.2, nowSec * 7, 'walk');
          } else {
            rig.root.rotation.y = Math.atan2(this.playerPos.x - curX, this.playerPos.z - curZ);
            animateCharacterRig(rig, 0, nowSec * 6, 'idle');
          }
        } else {
          rig.root.rotation.y = Math.atan2(this.playerPos.x - curX, this.playerPos.z - curZ);
          animateCharacterRig(rig, 0, nowSec * 6, 'attack');
        }
      }
    }

    // 8. Boss Abraham Sweetvoice
    if (this.bossRig) {
      const curX = this.bossRig.root.position.x;
      const curZ = this.bossRig.root.position.z;
      const distToPlayer = Math.hypot(this.playerPos.x - curX, this.playerPos.z - curZ);
      const bossInside =
        Math.abs(curX - CLUB_WORLD_POS.x) < CLUB_HALF_W - 0.5 &&
        Math.abs(curZ - CLUB_WORLD_POS.z) < CLUB_HALF_D - 0.5;
      const tx = playerInside && !bossInside ? doorway.x : this.playerPos.x;
      const tz = playerInside && !bossInside ? doorway.z - 2.2 : this.playerPos.z;

      if (distToPlayer > 2.8) {
        const bSpd = this.gameStateRef.bossFight.phase >= 2 ? 3.8 : 2.8;
        const res = moveActorWithCollisions(curX, curZ, tx, tz, bSpd, dt, 0.65, navColliders);
        this.bossRig.root.position.set(res.x, 0.12, res.z);
        if (res.movedDist > 0.002) {
          animateCharacterRig(this.bossRig, bSpd, nowSec * 6, 'walk');
        } else {
          animateCharacterRig(this.bossRig, 0, nowSec * 6, 'idle');
        }
      } else {
        animateCharacterRig(this.bossRig, 0, nowSec * 8, 'attack');
      }
      this.bossRig.root.rotation.y = Math.atan2(this.playerPos.x - curX, this.playerPos.z - curZ);
    }
  }

  private updateParticles(dt: number) {
    let anyChanged = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeTranslation(0, -50, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
      } else {
        p.vy -= 9.8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const s = Math.max(0.1, p.life * 2);
        _scale.set(s, s, s);
        _vecA.set(p.x, p.y, p.z);
        _mat4.compose(_vecA, _quat, _scale);
        this.particleMesh.setMatrixAt(i, _mat4);
      }
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);

    this.textures.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
