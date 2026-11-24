/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BuildingShopModal } from './components/BuildingShopModal';
import { CityMapModal } from './components/CityMapModal';
import { ClubManagementModal, ManagementTab } from './components/ClubManagementModal';
import { GameHud } from './components/GameHud';
import { InventoryModal } from './components/InventoryModal';
import { PauseAndEndModal, PoliceInspectionModal } from './components/PoliceInspectionModal';
import { RecruitmentModal } from './components/RecruitmentModal';
import { TitleScreen } from './components/TitleScreen';
import { CitySceneManager, NearbyInteraction } from './engine/CitySceneManager';
import { soundEngine } from './engine/audio';
import { addLedgerEntry, applyReputationDelta } from './game/EconomyComponent';
import {
  applyConsumableToEmployee,
  calculateNegotiationChance,
  convertCandidateToEmployee,
  upgradeEmployeeSkill,
} from './game/EmployeeManagementComponent';
import {
  applyPlayerAttackToBoss,
  resolveGangAttackVictoryOrLoss,
  resolvePoliceInspection,
  startAbrahamBossFight,
  startGangAttack,
} from './game/EventsManager';
import {
  clearSavedGame,
  hasSavedGame,
  loadGameFromStorage,
  saveGameToStorage,
} from './game/SaveGameManager';
import {
  GUARD_TRAINING_OPTIONS,
  hireSecurityApplicant,
  upgradeSafeRoom,
} from './game/SecurityManagementComponent';
import { createInitialGameState, stepSimulation } from './game/SimulationEngine';
import { BuildingCell, GameScreenState, GameState, SkillKey } from './game/types';
import { CITY_GRID, CONSUMABLE_CATALOG, OUTFIT_CATALOG } from './game/worldData';

type ActiveModal =
  | { type: 'none' }
  | { type: 'management'; tab: ManagementTab }
  | { type: 'map' }
  | { type: 'inventory' }
  | { type: 'recruit'; candidateId: string }
  | { type: 'building'; building: BuildingCell };

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [screenState, setScreenState] = useState<GameScreenState>(
    autostart ? 'playing' : 'title',
  );
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState());
  const [activeModal, setActiveModal] = useState<ActiveModal>({ type: 'none' });
  const [muted, setMuted] = useState(false);
  const [saveExists, setSaveExists] = useState(() => hasSavedGame());
  const [hudPosition, setHudPosition] = useState<{
    playerX: number;
    playerZ: number;
    insideClub: boolean;
    nearby: NearbyInteraction | null;
  }>({
    playerX: 32,
    playerZ: -16,
    insideClub: false,
    nearby: null,
  });

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CitySceneManager | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const screenStateRef = useRef<GameScreenState>(screenState);
  const activeModalRef = useRef<ActiveModal>(activeModal);

  gameStateRef.current = gameState;
  screenStateRef.current = screenState;
  activeModalRef.current = activeModal;

  // Mirror state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screenState;
    sceneRef.current?.setScreenState(
      activeModal.type !== 'none' || gameState.police.active
        ? 'paused'
        : screenState,
    );
  }, [screenState, activeModal.type, gameState.police.active]);

  // Sync game state changes to 3D scene
  useEffect(() => {
    sceneRef.current?.updateGameState(gameState);
    if (gameState.gameOverReason && screenState === 'playing') {
      setScreenState('gameover');
    } else if (
      gameState.victoryAchieved &&
      !gameState.bossFight.active &&
      screenState === 'playing'
    ) {
      soundEngine.playVictory();
      setScreenState('gameover');
    }
  }, [gameState, screenState]);

  const commitState = useCallback((updater: (prev: GameState) => GameState) => {
    setGameState((prev) => {
      const next = updater(prev);
      gameStateRef.current = next;
      return next;
    });
  }, []);

  const handlePlayerAttack = useCallback(() => {
    const s = gameStateRef.current;
    if (s.bossFight.active) {
      const res = applyPlayerAttackToBoss(s, 52);
      if (res.hitMinion || res.hitBoss) {
        soundEngine.playHit(res.hitBoss);
        sceneRef.current?.triggerCombatImpact(res.hitBoss);
        commitState(() => res.next);
      }
      return;
    }

    if (s.gangAttack.active) {
      soundEngine.playHit(false);
      sceneRef.current?.triggerCombatImpact(false);
      commitState((prev) => {
        if (!prev.gangAttack.active) return prev;
        const nextRemaining = Math.max(0, prev.gangAttack.enemiesRemaining - 1);
        const updated = {
          ...prev,
          gangAttack: {
            ...prev.gangAttack,
            enemiesRemaining: nextRemaining,
            playerHitsDealt: prev.gangAttack.playerHitsDealt + 1,
          },
        };
        if (nextRemaining <= 0) {
          soundEngine.playVictory();
          return resolveGangAttackVictoryOrLoss(updated, true);
        }
        return updated;
      });
    }
  }, [commitState]);

  const handlePlayerDodge = useCallback(() => {
    commitState((prev) => {
      if (!prev.bossFight.active || prev.bossFight.dodgeCooldown > 0) return prev;
      soundEngine.playClick();
      return {
        ...prev,
        bossFight: {
          ...prev.bossFight,
          dodgeCooldown: 1.5, // >1.0 grants brief i-frames against boss slam
        },
        lastNotification: 'Hızlı kaçınma hamlesi!',
      };
    });
  }, [commitState]);

  const handleInteraction = useCallback((interaction: NearbyInteraction) => {
    soundEngine.playClick();
    if (interaction.type === 'club_pc') {
      setActiveModal({ type: 'management', tab: 'rooms' });
    } else if (interaction.type === 'recruit') {
      setActiveModal({ type: 'recruit', candidateId: interaction.id });
    } else if (interaction.type === 'building') {
      const cell = CITY_GRID.find((c) => c.id === interaction.id);
      if (cell) {
        setActiveModal({ type: 'building', building: cell });
      }
    } else if (interaction.type === 'gang' || interaction.type === 'boss') {
      handlePlayerAttack();
    }
  }, [handlePlayerAttack]);

  // Mount Three.js scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const manager = new CitySceneManager(container, gameStateRef.current, {
      onSimulationTick: (dt) => {
        if (
          screenStateRef.current !== 'playing' ||
          activeModalRef.current.type !== 'none' ||
          gameStateRef.current.police.active
        ) {
          return;
        }
        commitState((prev) => stepSimulation(prev, dt));
      },
      onPlayerInteract: (interaction) => {
        handleInteraction(interaction);
      },
      onPlayerAttack: () => {
        handlePlayerAttack();
      },
      onPlayerDodge: () => {
        handlePlayerDodge();
      },
      onHudSync: (info) => {
        setHudPosition(info);
      },
    });

    sceneRef.current = manager;
    manager.setScreenState(screenStateRef.current);

    return () => {
      manager.dispose();
      sceneRef.current = null;
    };
  }, [commitState, handleInteraction, handlePlayerAttack, handlePlayerDodge]);

  const handleStartNew = useCallback(() => {
    soundEngine.playClick();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const fresh = createInitialGameState();
    setGameState(fresh);
    gameStateRef.current = fresh;
    setActiveModal({ type: 'none' });
    setScreenState('playing');
  }, []);

  const handleContinueSave = useCallback(() => {
    const loaded = loadGameFromStorage();
    if (loaded) {
      soundEngine.playClick();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setGameState(loaded);
      gameStateRef.current = loaded;
      setActiveModal({ type: 'none' });
      setScreenState('playing');
    } else {
      handleStartNew();
    }
  }, [handleStartNew]);

  // Global keyboard shortcuts (Title Enter/Space, Tab, M, I, Escape/P)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (screenStateRef.current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartNew();
        }
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        if (screenStateRef.current === 'playing') {
          setActiveModal((prev) =>
            prev.type === 'management' ? { type: 'none' } : { type: 'management', tab: 'rooms' },
          );
        }
      } else if (e.code === 'KeyM') {
        if (screenStateRef.current === 'playing') {
          setActiveModal((prev) => (prev.type === 'map' ? { type: 'none' } : { type: 'map' }));
        }
      } else if (e.code === 'KeyI') {
        if (screenStateRef.current === 'playing') {
          setActiveModal((prev) =>
            prev.type === 'inventory' ? { type: 'none' } : { type: 'inventory' },
          );
        }
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (activeModalRef.current.type !== 'none') {
          setActiveModal({ type: 'none' });
        } else if (screenStateRef.current === 'playing') {
          setScreenState('paused');
        } else if (screenStateRef.current === 'paused') {
          setScreenState('playing');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartNew]);

  // Gameplay Actions
  const handleAttemptHire = (candidateId: string, offeredPct: number) => {
    const cand = gameState.recruitPool.find((c) => c.id === candidateId);
    if (!cand) return { accepted: false, message: 'Aday bulunamadı.' };

    const chance = calculateNegotiationChance(cand, offeredPct, gameState.reputation);
    const roll = Math.random() * 100;
    if (roll <= chance) {
      const emp = convertCandidateToEmployee(cand, offeredPct);
      soundEngine.playCash();
      commitState((prev) => ({
        ...prev,
        employees: [...prev.employees, emp],
        recruitPool: prev.recruitPool.filter((r) => r.id !== candidateId),
        lastNotification: `${emp.fullDisplayName} %${offeredPct} komisyonla Number One Club ekibine katıldı!`,
      }));
      return {
        accepted: true,
        message: `Anlaşma sağlandı! ${emp.fullDisplayName} artık Number One Club çalışanı.`,
      };
    }

    soundEngine.playAlert();
    commitState((prev) => ({
      ...prev,
      recruitPool: prev.recruitPool.map((r) =>
        r.id === candidateId ? { ...r, rejectedCooldownDays: 1 } : r,
      ),
      lastNotification: `${cand.firstName} %${offeredPct} teklifini reddetti ve şehirde dolaşmaya devam ediyor.`,
    }));
    return {
      accepted: false,
      message: `${cand.firstName} teklifi yetersiz buldu (%${chance} şans). Yarın tekrar deneyebilir veya başka adaylara bakabilirsin.`,
    };
  };

  const handleUnlockRoom = (roomId: string) => {
    commitState((prev) => {
      const room = prev.rooms.find((r) => r.id === roomId);
      if (!room || room.unlocked || prev.money < room.unlockCost || prev.clubLevel < room.requiredClubLevel) {
        return prev;
      }
      soundEngine.playCash();
      let next = addLedgerEntry(prev, `${room.name} Açıldı`, -room.unlockCost, 'upgrade');
      next = applyReputationDelta(next, room.reputationBonus);
      return {
        ...next,
        rooms: next.rooms.map((r) => (r.id === roomId ? { ...r, unlocked: true } : r)),
        lastNotification: `${room.name} hizmete açıldı (+${room.reputationBonus} İtibar)!`,
      };
    });
  };

  const handleExpandClub = (type: 'dance' | 'lounge' | 'security_room') => {
    commitState((prev) => {
      if (type === 'dance' && !prev.expansions.extraDanceFloor && prev.money >= 1600) {
        soundEngine.playCash();
        let next = addLedgerEntry(prev, 'Ek Dans Alanı İnşası', -1600, 'upgrade');
        next = applyReputationDelta(next, 30);
        return {
          ...next,
          expansions: { ...next.expansions, extraDanceFloor: true },
          lastNotification: 'Ek Dans Alanı kuruldu!',
        };
      }
      if (type === 'lounge' && prev.expansions.loungeAreaLevel < 3 && prev.money >= 1100) {
        soundEngine.playCash();
        let next = addLedgerEntry(prev, 'Dinlenme Alanı Geliştirmesi', -1100, 'upgrade');
        next = applyReputationDelta(next, 18);
        return {
          ...next,
          expansions: { ...next.expansions, loungeAreaLevel: next.expansions.loungeAreaLevel + 1 },
          lastNotification: 'Dinlenme Alanı seviyesi yükseltildi!',
        };
      }
      if (type === 'security_room' && prev.expansions.securityRoomLevel < 3 && prev.money >= 1300) {
        soundEngine.playCash();
        let next = addLedgerEntry(prev, 'Güvenlik Odası Geliştirmesi', -1300, 'upgrade');
        return {
          ...next,
          expansions: {
            ...next.expansions,
            securityRoomLevel: next.expansions.securityRoomLevel + 1,
          },
          lastNotification: 'Güvenlik Odası geliştirildi!',
        };
      }
      return prev;
    });
  };

  const handleUpgradeSkill = (empId: string, skill: SkillKey, useMoney: boolean) => {
    commitState((prev) => {
      const emp = prev.employees.find((e) => e.id === empId);
      if (!emp || emp.skills[skill] >= 100) return prev;
      if (useMoney) {
        if (prev.money < 350) return prev;
        soundEngine.playCash();
        let next = addLedgerEntry(prev, `${emp.firstName} Yetenek Eğitimi`, -350, 'upgrade');
        return {
          ...next,
          employees: next.employees.map((e) =>
            e.id === empId
              ? { ...e, skills: { ...e.skills, [skill]: Math.min(100, e.skills[skill] + 5) } }
              : e,
          ),
        };
      }
      soundEngine.playClick();
      return {
        ...prev,
        employees: prev.employees.map((e) => (e.id === empId ? upgradeEmployeeSkill(e, skill, 5) : e)),
      };
    });
  };

  const handleUseConsumable = (empId: string, itemId: string) => {
    commitState((prev) => {
      const qty = prev.inventoryConsumables[itemId] ?? 0;
      const emp = prev.employees.find((e) => e.id === empId);
      if (qty <= 0 || !emp) return prev;

      const res = applyConsumableToEmployee(emp, itemId);
      if (res.error) {
        soundEngine.playAlert();
        return { ...prev, lastNotification: res.error };
      }
      soundEngine.playClick();
      return {
        ...prev,
        employees: prev.employees.map((e) => (e.id === empId ? res.updated : e)),
        inventoryConsumables: {
          ...prev.inventoryConsumables,
          [itemId]: qty - 1,
        },
        lastNotification: `${emp.firstName} için ${res.item?.name} kullanıldı.`,
      };
    });
  };

  const handleEquipOutfit = (empId: string, outfitId: string) => {
    soundEngine.playClick();
    commitState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) =>
        e.id === empId ? { ...e, equippedOutfitId: outfitId } : e,
      ),
    }));
  };

  const handleBuyConsumable = (itemId: string) => {
    const item = CONSUMABLE_CATALOG.find((c) => c.id === itemId);
    if (!item) return;
    commitState((prev) => {
      if (prev.money < item.cost) return prev;
      soundEngine.playCash();
      const next = addLedgerEntry(prev, `${item.name} Siparişi`, -item.cost, 'shop');
      return {
        ...next,
        inventoryConsumables: {
          ...next.inventoryConsumables,
          [item.id]: (next.inventoryConsumables[item.id] ?? 0) + 1,
        },
        lastNotification: `${item.name} işletme envanterine teslim edildi.`,
      };
    });
  };

  const handleBuyOutfit = (outfitId: string) => {
    const outfit = OUTFIT_CATALOG.find((o) => o.id === outfitId);
    if (!outfit) return;
    commitState((prev) => {
      if (
        prev.ownedOutfits.includes(outfitId) ||
        prev.money < outfit.cost ||
        prev.clubLevel < outfit.requiredClubLevel
      ) {
        return prev;
      }
      soundEngine.playCash();
      const next = addLedgerEntry(prev, `${outfit.name} Satın Alımı`, -outfit.cost, 'shop');
      return {
        ...next,
        ownedOutfits: [...next.ownedOutfits, outfitId],
        lastNotification: `${outfit.name} satın alındı! Çalışanlar sekmesinden giydirebilirsin.`,
      };
    });
  };

  const handleHireGuard = (applicantId: string) => {
    commitState((prev) => {
      const app = prev.guardApplicants.find((a) => a.id === applicantId);
      if (!app || prev.money < app.signingFee) return prev;
      soundEngine.playCash();
      const guard = hireSecurityApplicant(app);
      let next = addLedgerEntry(prev, `Koruma İşe Alımı: ${guard.name}`, -app.signingFee, 'payroll');
      next = applyReputationDelta(next, 12);
      return {
        ...next,
        guards: [...next.guards, guard],
        guardApplicants: next.guardApplicants.filter((a) => a.id !== applicantId),
        lastNotification: `${guard.name} güvenlik ekibine katıldı!`,
      };
    });
  };

  const handleTrainGuards = (key: keyof GameState['securityTraining']) => {
    const opt = GUARD_TRAINING_OPTIONS.find((o) => o.key === key);
    if (!opt) return;
    commitState((prev) => {
      const lvl = prev.securityTraining[key];
      const cost = opt.baseCost + lvl * 300;
      if (lvl >= 5 || prev.money < cost) return prev;
      soundEngine.playCash();
      const next = addLedgerEntry(prev, `Koruma Eğitimi: ${opt.label}`, -cost, 'upgrade');
      return {
        ...next,
        securityTraining: { ...next.securityTraining, [key]: lvl + 1 },
        guards: next.guards.map((g) => ({
          ...g,
          strength: key === 'physical' ? Math.min(100, g.strength + 8) : g.strength,
          endurance: key === 'physical' ? Math.min(100, g.endurance + 8) : g.endurance,
          defense: key === 'defense' ? Math.min(100, g.defense + 10) : g.defense,
          equipmentLevel: key === 'equipment' ? Math.min(5, g.equipmentLevel + 1) : g.equipmentLevel,
          attack: key === 'equipment' ? Math.min(100, g.attack + 8) : g.attack,
          loyalty: key === 'leadership' ? Math.min(100, g.loyalty + 10) : g.loyalty,
        })),
        lastNotification: `${opt.label} Sv.${lvl + 1} tamamlandı!`,
      };
    });
  };

  const handleUpgradeSafeRoom = (type: 'capacity' | 'armor' | 'speed' | 'emergency') => {
    commitState((prev) => {
      const upg = upgradeSafeRoom(prev.safeRoom, type);
      if (!upg || prev.money < upg.cost) return prev;
      soundEngine.playCash();
      const next = addLedgerEntry(prev, upg.label, -upg.cost, 'upgrade');
      return {
        ...next,
        safeRoom: upg.next,
        lastNotification: `${upg.label} tamamlandı!`,
      };
    });
  };

  const handleBuyPermit = (permit: 'business' | 'vip' | 'extended' | 'emp_permits') => {
    commitState((prev) => {
      if (permit === 'business' && !prev.permits.businessLicense && prev.money >= 500) {
        soundEngine.playCash();
        const next = addLedgerEntry(prev, 'City Council İşletme Ruhsatı', -500, 'upgrade');
        return { ...next, permits: { ...next.permits, businessLicense: true } };
      }
      if (permit === 'vip' && !prev.permits.vipPermit && prev.money >= 950) {
        soundEngine.playCash();
        const next = addLedgerEntry(prev, 'City Council VIP Ruhsatı', -950, 'upgrade');
        return { ...next, permits: { ...next.permits, vipPermit: true } };
      }
      if (permit === 'emp_permits') {
        const count = prev.employees.filter((e) => e.age >= 18 && e.age <= 20 && !e.hasWorkPermit).length;
        const cost = count * 300;
        if (count === 0 || prev.money < cost) return prev;
        soundEngine.playCash();
        const next = addLedgerEntry(prev, `${count} Çalışan Yaş İzin Belgesi`, -cost, 'upgrade');
        return {
          ...next,
          employees: next.employees.map((e) => ({ ...e, hasWorkPermit: true })),
          lastNotification: `${count} çalışan için City Council çalışma izni alındı.`,
        };
      }
      return prev;
    });
  };

  const handleSaveGame = () => {
    const ok = saveGameToStorage(gameStateRef.current);
    soundEngine.playClick();
    setSaveExists(ok);
    commitState((prev) => ({
      ...prev,
      lastNotification: ok
        ? 'Oyun ilerlemesi başarıyla kaydedildi!'
        : 'Kayıt sırasında tarayıcı depolama hatası oluştu.',
    }));
  };

  const activeCandidate =
    activeModal.type === 'recruit'
      ? gameState.recruitPool.find((r) => r.id === activeModal.candidateId) ?? null
      : null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#090b16]">
      {/* Isolated WebGL Three.js Canvas Mount */}
      <div
        ref={canvasMountRef}
        data-testid="game-canvas-mount"
        className="fixed inset-0 w-full h-full"
      />

      {/* Title Screen */}
      {screenState === 'title' && (
        <TitleScreen
          hasSave={saveExists}
          onStartNew={handleStartNew}
          onContinueSave={handleContinueSave}
        />
      )}

      {/* Active Gameplay HUD */}
      {screenState === 'playing' && (
        <GameHud
          gameState={gameState}
          playerX={hudPosition.playerX}
          playerZ={hudPosition.playerZ}
          insideClub={hudPosition.insideClub}
          nearby={hudPosition.nearby}
          muted={muted}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            soundEngine.setMuted(next);
          }}
          onOpenManagement={() => setActiveModal({ type: 'management', tab: 'rooms' })}
          onOpenMap={() => setActiveModal({ type: 'map' })}
          onOpenInventory={() => setActiveModal({ type: 'inventory' })}
          onSaveGame={handleSaveGame}
          onPause={() => setScreenState('paused')}
          onTriggerInteraction={handleInteraction}
        />
      )}

      {/* Interactive Modals */}
      {screenState === 'playing' && activeModal.type === 'management' && (
        <ClubManagementModal
          gameState={gameState}
          initialTab={activeModal.tab}
          onUnlockRoom={handleUnlockRoom}
          onExpandClub={handleExpandClub}
          onUpgradeSkill={handleUpgradeSkill}
          onUseConsumable={handleUseConsumable}
          onEquipOutfit={handleEquipOutfit}
          onBuyConsumable={handleBuyConsumable}
          onBuyOutfit={handleBuyOutfit}
          onHireGuard={handleHireGuard}
          onTrainGuards={handleTrainGuards}
          onUpgradeSafeRoom={handleUpgradeSafeRoom}
          onBuyPermit={handleBuyPermit}
          onTriggerPoliceInspection={() => {
            soundEngine.playAlert();
            setActiveModal({ type: 'none' });
            commitState((prev) => resolvePoliceInspection(prev));
          }}
          onTriggerGangDrill={() => {
            soundEngine.playAlert();
            setActiveModal({ type: 'none' });
            sceneRef.current?.teleportPlayerToBuilding('number_one_club');
            commitState((prev) => startGangAttack(prev));
          }}
          onStartBossFight={() => {
            soundEngine.playAlert();
            sceneRef.current?.teleportPlayerToBuilding('number_one_club');
            commitState((prev) => startAbrahamBossFight(prev));
          }}
          onSaveGame={handleSaveGame}
          onClose={() => setActiveModal({ type: 'none' })}
        />
      )}

      {screenState === 'playing' && activeModal.type === 'map' && (
        <CityMapModal
          playerX={hudPosition.playerX}
          playerZ={hudPosition.playerZ}
          onFastTravel={(buildingId) => {
            soundEngine.playClick();
            sceneRef.current?.teleportPlayerToBuilding(buildingId);
          }}
          onClose={() => setActiveModal({ type: 'none' })}
        />
      )}

      {screenState === 'playing' && activeModal.type === 'inventory' && (
        <InventoryModal
          gameState={gameState}
          onUseConsumable={handleUseConsumable}
          onClose={() => setActiveModal({ type: 'none' })}
        />
      )}

      {screenState === 'playing' && activeModal.type === 'recruit' && activeCandidate && (
        <RecruitmentModal
          candidate={activeCandidate}
          clubReputation={gameState.reputation}
          onAttemptHire={handleAttemptHire}
          onClose={() => setActiveModal({ type: 'none' })}
        />
      )}

      {screenState === 'playing' && activeModal.type === 'building' && (
        <BuildingShopModal
          building={activeModal.building}
          gameState={gameState}
          onBuyConsumable={handleBuyConsumable}
          onBuyOutfit={handleBuyOutfit}
          onBuyPermit={handleBuyPermit}
          onDevelopEmptyLot={() => {
            commitState((prev) => {
              if (prev.expansions.emptyLotBuilt || prev.money < 3200) return prev;
              soundEngine.playCash();
              let next = addLedgerEntry(prev, 'Boş Arazi VIP Lojistik Yatırımı', -3200, 'upgrade');
              next = applyReputationDelta(next, 60);
              return {
                ...next,
                expansions: { ...next.expansions, emptyLotBuilt: true },
                lastNotification: 'Boş Arazi geliştirildi (+60 İtibar)!',
              };
            });
          }}
          onPayPoliceClosure={() => {
            commitState((prev) => {
              if (prev.money < 600) return prev;
              soundEngine.playCash();
              const next = addLedgerEntry(prev, 'Emniyet Mühür Kaldırma Kefaleti', -600, 'fine');
              return {
                ...next,
                police: { ...next.police, temporaryClosureHours: 0 },
                lastNotification: 'Kulüp mühürü kaldırıldı, işletme yeniden açık!',
              };
            });
          }}
          onClose={() => setActiveModal({ type: 'none' })}
        />
      )}

      {/* Police Inspection Modal */}
      {screenState === 'playing' && gameState.police.active && (
        <PoliceInspectionModal
          gameState={gameState}
          onAcknowledge={() => {
            soundEngine.playClick();
            commitState((prev) => ({
              ...prev,
              police: { ...prev.police, active: false },
            }));
          }}
        />
      )}

      {/* Pause & Victory / Game Over Modal */}
      <PauseAndEndModal
        screenState={screenState}
        gameState={gameState}
        onResume={() => setScreenState('playing')}
        onRestart={() => {
          clearSavedGame();
          handleStartNew();
        }}
        onSave={handleSaveGame}
        onReturnTitle={() => {
          setActiveModal({ type: 'none' });
          setScreenState('title');
        }}
        onContinueAfterVictory={() => {
          setGameState((prev) => ({ ...prev, victoryAchieved: false }));
          setScreenState('playing');
        }}
      />
    </main>
  );
}
