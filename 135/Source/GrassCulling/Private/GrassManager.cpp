// Copyright Epic Games, Inc. All Rights Reserved.

#include "GrassManager.h"
#include "GrassData.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerCameraManager.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "SceneInterface.h"
#include "RenderingThread.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Engine/Canvas.h"

AGrassManager::AGrassManager()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.0f;

	SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
	SetRootComponent(SceneRoot);

	CloseISM = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("CloseISM"));
	CloseISM->SetupAttachment(SceneRoot);
	CloseISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	MediumISM = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("MediumISM"));
	MediumISM->SetupAttachment(SceneRoot);
	MediumISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	FarISM = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("FarISM"));
	FarISM->SetupAttachment(SceneRoot);
	FarISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	ImpostorISM = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("ImpostorISM"));
	ImpostorISM->SetupAttachment(SceneRoot);
	ImpostorISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	GrassConfig = nullptr;

	TotalGrassCount = 0;
	CloseCount = 0;
	MediumCount = 0;
	FarCount = 0;
	CulledCount = 0;
	ImpostorCount = 0;
	FrustumCulledCount = 0;
	OcclusionCulledCount = 0;
	CullingEfficiency = 0.0f;

	WindSpeed = 1.0f;
	GlobalWindDirection = FVector(1.0f, 0.5f, 0.0f);
	GlobalWindStrength = 10.0f;

	TimeSinceLastLODUpdate = 0.0f;
	LastCameraPosition = FVector::ZeroVector;
	CameraVelocity = FVector::ZeroVector;
	CurrentUpdateBatchStart = 0;
	PredictedCameraPosition = FVector::ZeroVector;

	TimeSinceLastOcclusionTest = 0.0f;
	CurrentOcclusionTestChunk = 0;

	HZBDepthTexture = nullptr;
	DepthCaptureComponent = nullptr;

	ScreenSize = FVector2D(1920.0f, 1080.0f);
}

void AGrassManager::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	InitializeISMComponents();
}

void AGrassManager::BeginPlay()
{
	Super::BeginPlay();
	InitializeGrass();
	InitializeHZBResources();
}

void AGrassManager::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (GrassConfig && TotalGrassCount > 0)
	{
		UWorld* World = GetWorld();
		if (World)
		{
			APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
			if (CameraManager)
			{
				const FVector CurrentCameraPos = CameraManager->GetCameraLocation();
				CameraVelocity = (CurrentCameraPos - LastCameraPosition) / FMath::Max(DeltaSeconds, 0.001f);
				LastCameraPosition = CurrentCameraPos;
			}
		}

		UpdateCameraPrediction(DeltaSeconds);
		UpdateFrustumPlanes();

		TimeSinceLastLODUpdate += DeltaSeconds;
		TimeSinceLastOcclusionTest += DeltaSeconds;

		if (TimeSinceLastLODUpdate >= GrassConfig->LODUpdateInterval)
		{
			PerformFrustumCulling();
			PerformOcclusionCulling();
			UpdateLODStates();
			UpdateChunkVisibility();
			ApplyCullingResults();
			UpdateTransitionAlphas(DeltaSeconds);
			TimeSinceLastLODUpdate = 0.0f;
		}

		UpdateWind(DeltaSeconds);
	}
}

void AGrassManager::InitializeGrass()
{
	if (!GrassConfig)
	{
		UE_LOG(LogGrassCulling, Warning, TEXT("GrassConfig is not set!"));
		return;
	}

	InitializeISMComponents();
	GenerateGrassInstances();
	UpdateFrustumPlanes();
	PerformFrustumCulling();
	PerformOcclusionCulling();
	UpdateLODStates();
	UpdateChunkVisibility();
	ApplyCullingResults();
	UpdateMaterialParameters();

	UE_LOG(LogGrassCulling, Log, TEXT("GrassManager initialized with %d total instances"), TotalGrassCount);
}

void AGrassManager::RegenerateGrass()
{
	CloseISM->ClearInstances();
	MediumISM->ClearInstances();
	FarISM->ClearInstances();
	ImpostorISM->ClearInstances();

	AllInstances.Empty();
	GrassChunks.Empty();
	FreeCloseIndices.Empty();
	FreeMediumIndices.Empty();
	FreeFarIndices.Empty();
	FreeImpostorIndices.Empty();
	HiddenCloseIndices.Empty();
	HiddenMediumIndices.Empty();
	HiddenFarIndices.Empty();
	HiddenImpostorIndices.Empty();
	PendingOcclusionResults.Empty();

	TotalGrassCount = 0;
	CloseCount = 0;
	MediumCount = 0;
	FarCount = 0;
	CulledCount = 0;
	ImpostorCount = 0;
	FrustumCulledCount = 0;
	OcclusionCulledCount = 0;

	CurrentUpdateBatchStart = 0;
	CurrentOcclusionTestChunk = 0;

	GenerateGrassInstances();
	UpdateFrustumPlanes();
	PerformFrustumCulling();
	PerformOcclusionCulling();
	UpdateLODStates();
	UpdateChunkVisibility();
	ApplyCullingResults();
}

void AGrassManager::UpdateWindParameters(const FVector& WindDir, float Strength, float Speed)
{
	GlobalWindDirection = WindDir.GetSafeNormal();
	GlobalWindStrength = Strength;
	WindSpeed = Speed;

	UpdateMaterialParameters();
}

FString AGrassManager::GetStatsString() const
{
	const int32 TotalCulled = CulledCount + FrustumCulledCount + OcclusionCulledCount;
	const float TotalEfficiency = TotalGrassCount > 0 ? static_cast<float>(TotalCulled) / static_cast<float>(TotalGrassCount) * 100.0f : 0.0f;

	return FString::Printf(
		TEXT("=== Grass Culling Stats ===\n")
		TEXT("Total: %d | Rendered: %d | Total Culled: %d (%.1f%%)\n")
		TEXT("Distance Culled: %d | Frustum Culled: %d | Occlusion Culled: %d\n")
		TEXT("LOD - Close: %d | Medium: %d | Far: %d | Impostor: %d\n")
		TEXT("Hidden Pool - Close: %d | Medium: %d | Far: %d | Impostor: %d"),
		TotalGrassCount,
		GetRenderedCount(),
		TotalCulled,
		TotalEfficiency,
		CulledCount,
		FrustumCulledCount,
		OcclusionCulledCount,
		CloseCount,
		MediumCount,
		FarCount,
		ImpostorCount,
		HiddenCloseIndices.Num(),
		HiddenMediumIndices.Num(),
		HiddenFarIndices.Num(),
		HiddenImpostorIndices.Num()
	);
}

void AGrassManager::ForceLODUpdate()
{
	CurrentUpdateBatchStart = 0;
	UpdateLODStates();
}

float AGrassManager::GetLODHysteresis() const
{
	return GrassConfig ? GrassConfig->LODHysteresisPercent : 0.15f;
}

void AGrassManager::SetCameraVelocity(const FVector& Velocity)
{
	CameraVelocity = Velocity;
}

void AGrassManager::ForceOcclusionTest()
{
	TimeSinceLastOcclusionTest = GrassConfig ? GrassConfig->OcclusionTestInterval : 0.25f;
	CurrentOcclusionTestChunk = 0;
}

void AGrassManager::SetFrustumCullingEnabled(bool bEnabled)
{
	if (GrassConfig)
	{
		GrassConfig->bEnableFrustumCulling = bEnabled;
	}
}

void AGrassManager::SetOcclusionCullingEnabled(bool bEnabled)
{
	if (GrassConfig)
	{
		GrassConfig->bEnableOcclusionCulling = bEnabled;
	}
}

void AGrassManager::InitializeISMComponents()
{
	if (!GrassConfig)
	{
		return;
	}

	if (GrassConfig->GrassMesh && CloseISM)
	{
		CloseISM->SetStaticMesh(GrassConfig->GrassMesh);
		if (GrassConfig->GrassMaterial)
		{
			CloseISM->SetMaterial(0, GrassConfig->GrassMaterial);
		}
	}

	if (GrassConfig->GrassSimplifiedMesh && MediumISM)
	{
		MediumISM->SetStaticMesh(GrassConfig->GrassSimplifiedMesh);
		if (GrassConfig->GrassMaterial)
		{
			MediumISM->SetMaterial(0, GrassConfig->GrassMaterial);
		}
	}

	if (GrassConfig->GrassSimplifiedMesh && FarISM)
	{
		FarISM->SetStaticMesh(GrassConfig->GrassSimplifiedMesh);
		if (GrassConfig->GrassMaterial)
		{
			FarISM->SetMaterial(0, GrassConfig->GrassMaterial);
		}
	}

	if (GrassConfig->ImpostorBillboardMesh && ImpostorISM)
	{
		ImpostorISM->SetStaticMesh(GrassConfig->ImpostorBillboardMesh);
		if (GrassConfig->ImpostorMaterial)
		{
			ImpostorISM->SetMaterial(0, GrassConfig->ImpostorMaterial);
		}
	}
}

void AGrassManager::GenerateGrassInstances()
{
	if (!GrassConfig)
	{
		return;
	}

	const FVector2D Extent = GrassConfig->SpawnExtent;
	const int32 ChunkSize = GrassConfig->ChunkSize;
	const float Density = GrassConfig->SpawnDensity;
	const float Area = Extent.X * Extent.Y;
	const int32 TargetCount = FMath::FloorToInt(Area / 10000.0f * Density);

	UE_LOG(LogGrassCulling, Log, TEXT("Generating %d grass instances..."), TargetCount);

	AllInstances.Reserve(TargetCount);

	FRandomStream RandomStream(12345);

	for (int32 i = 0; i < TargetCount; i++)
	{
		FGrassInstance Instance;

		const float X = RandomStream.FRandRange(-Extent.X / 2.0f, Extent.X / 2.0f);
		const float Y = RandomStream.FRandRange(-Extent.Y / 2.0f, Extent.Y / 2.0f);

		Instance.Position = FVector(X, Y, 0.0f);

		if (GrassConfig->bRandomRotation)
		{
			Instance.Rotation = FRotator(0.0f, RandomStream.FRandRange(0.0f, 360.0f), 0.0f);
		}

		const float ScaleValue = RandomStream.FRandRange(GrassConfig->ScaleRange.X, GrassConfig->ScaleRange.Y);
		Instance.Scale = FVector(ScaleValue);

		Instance.RandomSeed = RandomStream.FRand();
		Instance.CurrentLOD = EGrassLOD::Culled;
		Instance.TargetLOD = EGrassLOD::Culled;
		Instance.ISMIndex = INDEX_NONE;
		Instance.ImpostorISMIndex = INDEX_NONE;
		Instance.LODConfirmCount = 0;
		Instance.TransitionAlpha = 1.0f;
		Instance.TransitionState = ELODTransitionState::Stable;
		Instance.bIsHidden = false;
		Instance.OcclusionState = EOcclusionState::Unknown;
		Instance.LastOcclusionTestTime = 0.0f;
		Instance.bInFrustum = true;

		AllInstances.Add(Instance);
	}

	TotalGrassCount = AllInstances.Num();

	const int32 NumChunks = FMath::CeilToInt(static_cast<float>(TotalGrassCount) / ChunkSize);
	GrassChunks.Reserve(NumChunks);

	for (int32 ChunkIdx = 0; ChunkIdx < NumChunks; ChunkIdx++)
	{
		FGrassChunkData Chunk;
		Chunk.ChunkIndex = ChunkIdx;
		Chunk.bIsVisible = false;
		Chunk.BoundingBox = FBox(EForceInit::ForceInit);
		Chunk.InstanceStartIndex = ChunkIdx * ChunkSize;
		Chunk.InstanceCount = FMath::Min(ChunkSize, TotalGrassCount - Chunk.InstanceStartIndex);
		Chunk.ChunkOcclusionState = EOcclusionState::Unknown;
		Chunk.bInFrustum = true;
		Chunk.OcclusionQueryId = INDEX_NONE;

		const int32 StartIdx = Chunk.InstanceStartIndex;
		const int32 EndIdx = FMath::Min(StartIdx + ChunkSize, TotalGrassCount);

		for (int32 InstanceIdx = StartIdx; InstanceIdx < EndIdx; InstanceIdx++)
		{
			Chunk.BoundingBox += AllInstances[InstanceIdx].Position;
		}

		Chunk.BoundingBox = Chunk.BoundingBox.ExpandBy(100.0f);

		GrassChunks.Add(Chunk);
	}

	UE_LOG(LogGrassCulling, Log, TEXT("Generated %d instances in %d chunks"), TotalGrassCount, NumChunks);
}

int32 AGrassManager::GetChunkIndex(const FVector& Position) const
{
	if (!GrassConfig)
	{
		return INDEX_NONE;
	}

	const FVector2D Extent = GrassConfig->SpawnExtent;
	const int32 ChunkSize = GrassConfig->ChunkSize;

	const float NormalizedX = (Position.X + Extent.X / 2.0f) / Extent.X;
	const float NormalizedY = (Position.Y + Extent.Y / 2.0f) / Extent.Y;

	const int32 GridSize = FMath::CeilToInt(FMath::Sqrt(static_cast<float>(TotalGrassCount) / ChunkSize));
	const int32 CellX = FMath::Clamp(FMath::FloorToInt(NormalizedX * GridSize), 0, GridSize - 1);
	const int32 CellY = FMath::Clamp(FMath::FloorToInt(NormalizedY * GridSize), 0, GridSize - 1);

	return CellY * GridSize + CellX;
}

FVector AGrassManager::GetChunkPosition(int32 ChunkIndex) const
{
	if (ChunkIndex < 0 || ChunkIndex >= GrassChunks.Num())
	{
		return FVector::ZeroVector;
	}

	return GrassChunks[ChunkIndex].BoundingBox.GetCenter();
}

float AGrassManager::GetHysteresisDistance(float BaseDistance) const
{
	if (!GrassConfig)
	{
		return 0.0f;
	}

	return BaseDistance * GrassConfig->LODHysteresisPercent;
}

EGrassLOD AGrassManager::GetLODFromDistance(float Distance, EGrassLOD CurrentLOD) const
{
	if (!GrassConfig)
	{
		return EGrassLOD::Culled;
	}

	const float Hysteresis = GetHysteresisDistance(GrassConfig->CloseLODDistance);

	const float CloseDist = GrassConfig->CloseLODDistance;
	const float MediumDist = GrassConfig->MediumLODDistance;
	const float FarDist = GrassConfig->FarLODDistance;
	const float CullDist = GrassConfig->CullDistance;

	switch (CurrentLOD)
	{
	case EGrassLOD::Close:
		if (Distance > CloseDist + Hysteresis)
		{
			if (Distance > MediumDist + GetHysteresisDistance(MediumDist))
			{
				if (Distance > FarDist + GetHysteresisDistance(FarDist))
				{
					if (Distance > CullDist + GetHysteresisDistance(CullDist))
					{
						return EGrassLOD::Culled;
					}
					return EGrassLOD::Far;
				}
				return EGrassLOD::Medium;
			}
		}
		return EGrassLOD::Close;

	case EGrassLOD::Medium:
		if (Distance < CloseDist - Hysteresis)
		{
			return EGrassLOD::Close;
		}
		if (Distance > MediumDist + Hysteresis)
		{
			if (Distance > FarDist + GetHysteresisDistance(FarDist))
			{
				if (Distance > CullDist + GetHysteresisDistance(CullDist))
				{
					return EGrassLOD::Culled;
				}
				return EGrassLOD::Far;
			}
		}
		return EGrassLOD::Medium;

	case EGrassLOD::Far:
		if (Distance < CloseDist - Hysteresis)
		{
			return EGrassLOD::Close;
		}
		if (Distance < MediumDist - GetHysteresisDistance(MediumDist))
		{
			return EGrassLOD::Medium;
		}
		if (Distance > CullDist + Hysteresis)
		{
			return EGrassLOD::Culled;
		}
		return EGrassLOD::Far;

	case EGrassLOD::Culled:
	default:
		if (Distance < CullDist - Hysteresis)
		{
			if (Distance < FarDist - GetHysteresisDistance(FarDist))
			{
				if (Distance < MediumDist - GetHysteresisDistance(MediumDist))
				{
					if (Distance < CloseDist - Hysteresis)
					{
						return EGrassLOD::Close;
					}
					return EGrassLOD::Medium;
				}
			}
			return EGrassLOD::Far;
		}
		return EGrassLOD::Culled;
	}
}

EGrassLOD AGrassManager::CalculateLOD(const FVector& Position, const FVector& CameraPosition, EGrassLOD CurrentLOD) const
{
	const float Distance = FVector::Dist(Position, CameraPosition);
	return GetLODFromDistance(Distance, CurrentLOD);
}

void AGrassManager::ProcessLODTransition(FGrassInstance& Instance, EGrassLOD NewTargetLOD, float DeltaTime)
{
	if (Instance.TargetLOD != NewTargetLOD)
	{
		Instance.TargetLOD = NewTargetLOD;
		Instance.LODConfirmCount = 1;
		Instance.TransitionState = ELODTransitionState::Transitioning;
	}
	else if (Instance.TransitionState == ELODTransitionState::Transitioning)
	{
		Instance.LODConfirmCount++;

		const int32 RequiredConfirmations = GrassConfig ? GrassConfig->RequiredLODConfirmations : 2;

		if (Instance.LODConfirmCount >= RequiredConfirmations)
		{
			RemoveInstanceFromISM(Instance);
			AssignInstanceToISM(Instance, NewTargetLOD);

			Instance.CurrentLOD = NewTargetLOD;
			Instance.TransitionState = ELODTransitionState::Stable;
			Instance.LODConfirmCount = 0;
			Instance.bIsHidden = false;
		}
	}
}

void AGrassManager::AssignInstanceToISM(FGrassInstance& Instance, EGrassLOD NewLOD)
{
	const FTransform Transform(Instance.Rotation, Instance.Position, Instance.Scale);

	switch (NewLOD)
	{
	case EGrassLOD::Close:
		if (FreeCloseIndices.Num() > 0)
		{
			const int32 FreeIdx = FreeCloseIndices.Pop(EAllowShrinking::No);
			CloseISM->UpdateInstanceTransform(FreeIdx, Transform, true, true, true);
			Instance.ISMIndex = FreeIdx;
		}
		else if (HiddenCloseIndices.Num() > 0)
		{
			const int32 HiddenIdx = HiddenCloseIndices.Pop(EAllowShrinking::No);
			CloseISM->UpdateInstanceTransform(HiddenIdx, Transform, true, true, true);
			CloseISM->SetInstanceHidden(HiddenIdx, false);
			Instance.ISMIndex = HiddenIdx;
		}
		else
		{
			Instance.ISMIndex = CloseISM->AddInstance(Transform);
		}
		Instance.ImpostorISMIndex = INDEX_NONE;
		CloseCount++;
		break;

	case EGrassLOD::Medium:
		if (FreeMediumIndices.Num() > 0)
		{
			const int32 FreeIdx = FreeMediumIndices.Pop(EAllowShrinking::No);
			MediumISM->UpdateInstanceTransform(FreeIdx, Transform, true, true, true);
			Instance.ISMIndex = FreeIdx;
		}
		else if (HiddenMediumIndices.Num() > 0)
		{
			const int32 HiddenIdx = HiddenMediumIndices.Pop(EAllowShrinking::No);
			MediumISM->UpdateInstanceTransform(HiddenIdx, Transform, true, true, true);
			MediumISM->SetInstanceHidden(HiddenIdx, false);
			Instance.ISMIndex = HiddenIdx;
		}
		else
		{
			Instance.ISMIndex = MediumISM->AddInstance(Transform);
		}
		Instance.ImpostorISMIndex = INDEX_NONE;
		MediumCount++;
		break;

	case EGrassLOD::Far:
		if (FreeImpostorIndices.Num() > 0)
		{
			const int32 FreeIdx = FreeImpostorIndices.Pop(EAllowShrinking::No);
			ImpostorISM->UpdateInstanceTransform(FreeIdx, Transform, true, true, true);
			Instance.ImpostorISMIndex = FreeIdx;
		}
		else if (HiddenImpostorIndices.Num() > 0)
		{
			const int32 HiddenIdx = HiddenImpostorIndices.Pop(EAllowShrinking::No);
			ImpostorISM->UpdateInstanceTransform(HiddenIdx, Transform, true, true, true);
			ImpostorISM->SetInstanceHidden(HiddenIdx, false);
			Instance.ImpostorISMIndex = HiddenIdx;
		}
		else
		{
			Instance.ImpostorISMIndex = ImpostorISM->AddInstance(Transform);
		}
		Instance.ISMIndex = INDEX_NONE;
		ImpostorCount++;
		break;

	case EGrassLOD::Culled:
	default:
		if (GrassConfig && GrassConfig->bUseHiddenInsteadOfRemove)
		{
			HideInstanceInISM(Instance);
		}
		else
		{
			RemoveInstanceFromISM(Instance);
		}
		CulledCount++;
		break;
	}
}

void AGrassManager::RemoveInstanceFromISM(FGrassInstance& Instance)
{
	if (Instance.ISMIndex != INDEX_NONE)
	{
		switch (Instance.CurrentLOD)
		{
		case EGrassLOD::Close:
			if (Instance.ISMIndex < CloseISM->GetInstanceCount())
			{
				CloseISM->RemoveInstance(Instance.ISMIndex);
				FreeCloseIndices.Add(Instance.ISMIndex);
			}
			CloseCount = FMath::Max(0, CloseCount - 1);
			break;

		case EGrassLOD::Medium:
			if (Instance.ISMIndex < MediumISM->GetInstanceCount())
			{
				MediumISM->RemoveInstance(Instance.ISMIndex);
				FreeMediumIndices.Add(Instance.ISMIndex);
			}
			MediumCount = FMath::Max(0, MediumCount - 1);
			break;

		case EGrassLOD::Far:
			if (Instance.ISMIndex < FarISM->GetInstanceCount())
			{
				FarISM->RemoveInstance(Instance.ISMIndex);
				FreeFarIndices.Add(Instance.ISMIndex);
			}
			FarCount = FMath::Max(0, FarCount - 1);
			break;

		default:
			break;
		}

		Instance.ISMIndex = INDEX_NONE;
	}

	if (Instance.ImpostorISMIndex != INDEX_NONE)
	{
		if (Instance.ImpostorISMIndex < ImpostorISM->GetInstanceCount())
		{
			ImpostorISM->RemoveInstance(Instance.ImpostorISMIndex);
			FreeImpostorIndices.Add(Instance.ImpostorISMIndex);
		}
		ImpostorCount = FMath::Max(0, ImpostorCount - 1);
		Instance.ImpostorISMIndex = INDEX_NONE;
	}
}

void AGrassManager::HideInstanceInISM(FGrassInstance& Instance)
{
	if (Instance.ISMIndex != INDEX_NONE && !Instance.bIsHidden)
	{
		switch (Instance.CurrentLOD)
		{
		case EGrassLOD::Close:
			HiddenCloseIndices.Add(Instance.ISMIndex);
			CloseISM->SetInstanceHidden(Instance.ISMIndex, true);
			CloseCount = FMath::Max(0, CloseCount - 1);
			break;

		case EGrassLOD::Medium:
			HiddenMediumIndices.Add(Instance.ISMIndex);
			MediumISM->SetInstanceHidden(Instance.ISMIndex, true);
			MediumCount = FMath::Max(0, MediumCount - 1);
			break;

		case EGrassLOD::Far:
			HiddenFarIndices.Add(Instance.ISMIndex);
			FarISM->SetInstanceHidden(Instance.ISMIndex, true);
			FarCount = FMath::Max(0, FarCount - 1);
			break;

		default:
			break;
		}

		Instance.bIsHidden = true;
	}

	if (Instance.ImpostorISMIndex != INDEX_NONE && !Instance.bIsHidden)
	{
		HiddenImpostorIndices.Add(Instance.ImpostorISMIndex);
		ImpostorISM->SetInstanceHidden(Instance.ImpostorISMIndex, true);
		ImpostorCount = FMath::Max(0, ImpostorCount - 1);
		Instance.bIsHidden = true;
	}
}

void AGrassManager::ShowInstanceInISM(FGrassInstance& Instance)
{
	if (Instance.ISMIndex != INDEX_NONE && Instance.bIsHidden)
	{
		switch (Instance.CurrentLOD)
		{
		case EGrassLOD::Close:
			CloseISM->SetInstanceHidden(Instance.ISMIndex, false);
			CloseCount++;
			break;

		case EGrassLOD::Medium:
			MediumISM->SetInstanceHidden(Instance.ISMIndex, false);
			MediumCount++;
			break;

		case EGrassLOD::Far:
			FarISM->SetInstanceHidden(Instance.ISMIndex, false);
			FarCount++;
			break;

		default:
			break;
		}

		Instance.bIsHidden = false;
	}

	if (Instance.ImpostorISMIndex != INDEX_NONE && Instance.bIsHidden)
	{
		ImpostorISM->SetInstanceHidden(Instance.ImpostorISMIndex, false);
		ImpostorCount++;
		Instance.bIsHidden = false;
	}
}

void AGrassManager::UpdateCameraPrediction(float DeltaTime)
{
	if (!GrassConfig || !GrassConfig->bEnableCameraPrediction)
	{
		PredictedCameraPosition = LastCameraPosition;
		return;
	}

	const float MaxDist = GrassConfig->MaxPredictionDistance;
	const float TimeHorizon = GrassConfig->PredictionTimeHorizon;

	FVector PredictedMovement = CameraVelocity * TimeHorizon;
	const float MovementDist = PredictedMovement.Size();

	if (MovementDist > MaxDist)
	{
		PredictedMovement = PredictedMovement.GetSafeNormal() * MaxDist;
	}

	PredictedCameraPosition = LastCameraPosition + PredictedMovement;
}

void AGrassManager::UpdateFrustumPlanes()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
	if (!CameraManager)
	{
		return;
	}

	const FVector CameraLocation = CameraManager->GetCameraLocation();
	const FRotator CameraRotation = CameraManager->GetCameraRotation();
	const FVector CameraForward = CameraRotation.Vector();
	const FVector CameraRight = FVector::CrossProduct(FVector::UpVector, CameraForward).GetSafeNormal();
	const FVector CameraUp = FVector::CrossProduct(CameraForward, CameraRight).GetSafeNormal();

	float FOV = 90.0f;
	float AspectRatio = 16.0f / 9.0f;

	if (APlayerController* PC = Cast<APlayerController>(CameraManager->GetOwningPlayerController()))
	{
		PC->GetPlayerViewPoint(CameraLocation, CameraRotation);
	}

	FMinimalViewInfo ViewInfo;
	CameraManager->GetCameraView(0.0f, ViewInfo);
	FOV = ViewInfo.FOV;
	AspectRatio = ViewInfo.AspectRatio;

	const float HalfFOV = FMath::DegreesToRadians(FOV) * 0.5f;
	const float SinHalfFOV = FMath::Sin(HalfFOV);
	const float CosHalfFOV = FMath::Cos(HalfFOV);

	const float NearPlane = 10.0f;
	const float FarPlane = GrassConfig ? GrassConfig->CullDistance + 1000.0f : 10000.0f;

	FVector RightVec = CameraRight;
	FVector UpVec = CameraUp;

	CurrentFrustumPlanes.Planes[0] = FPlane(CameraLocation + CameraForward * NearPlane, CameraForward);
	CurrentFrustumPlanes.Planes[1] = FPlane(CameraLocation + CameraForward * FarPlane, -CameraForward);

	const FVector NearTopLeft = CameraLocation + CameraForward * NearPlane - RightVec * NearPlane * FMath::Tan(HalfFOV) * AspectRatio + UpVec * NearPlane * FMath::Tan(HalfFOV);
	const FVector NearTopRight = CameraLocation + CameraForward * NearPlane + RightVec * NearPlane * FMath::Tan(HalfFOV) * AspectRatio + UpVec * NearPlane * FMath::Tan(HalfFOV);
	const FVector NearBottomLeft = CameraLocation + CameraForward * NearPlane - RightVec * NearPlane * FMath::Tan(HalfFOV) * AspectRatio - UpVec * NearPlane * FMath::Tan(HalfFOV);
	const FVector FarTopLeft = CameraLocation + CameraForward * FarPlane - RightVec * FarPlane * FMath::Tan(HalfFOV) * AspectRatio + UpVec * FarPlane * FMath::Tan(HalfFOV);
	const FVector FarBottomRight = CameraLocation + CameraForward * FarPlane + RightVec * FarPlane * FMath::Tan(HalfFOV) * AspectRatio - UpVec * FarPlane * FMath::Tan(HalfFOV);

	CurrentFrustumPlanes.Planes[2] = FPlane(NearTopLeft, NearTopRight, FarTopLeft);
	CurrentFrustumPlanes.Planes[3] = FPlane(NearBottomLeft, FarBottomRight, NearBottomLeft + CameraRight);
	CurrentFrustumPlanes.Planes[4] = FPlane(NearTopLeft, FarTopLeft, NearBottomLeft);
	CurrentFrustumPlanes.Planes[5] = FPlane(NearTopRight, NearBottomRight(), FarTopLeft + CameraRight);
}

FVector AGrassManager::NearBottomRight() const
{
	UWorld* World = GetWorld();
	if (!World) return FVector::ZeroVector;
	
	APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
	if (!CameraManager) return FVector::ZeroVector;

	const FVector CameraLocation = CameraManager->GetCameraLocation();
	const FVector CameraForward = CameraManager->GetCameraRotation().Vector();
	const FVector CameraRight = FVector::CrossProduct(FVector::UpVector, CameraForward).GetSafeNormal();
	const FVector CameraUp = FVector::CrossProduct(CameraForward, CameraRight).GetSafeNormal();

	float FOV = 90.0f;
	float AspectRatio = 16.0f / 9.0f;
	float NearPlane = 10.0f;

	return CameraLocation + CameraForward * NearPlane + CameraRight * NearPlane * FMath::Tan(FMath::DegreesToRadians(FOV) * 0.5f) * AspectRatio - CameraUp * NearPlane * FMath::Tan(FMath::DegreesToRadians(FOV) * 0.5f);
}

bool AGrassManager::IsBoxInFrustum(const FBox& Bounds, const FFrustumPlanes& Frustum, float Padding) const
{
	if (!Bounds.IsValid)
	{
		return false;
	}

	const FVector BoxCenter = Bounds.GetCenter();
	const FVector BoxExtent = Bounds.GetExtent() + FVector(Padding);

	for (int32 PlaneIndex = 0; PlaneIndex < 6; PlaneIndex++)
	{
		const FPlane& Plane = Frustum.Planes[PlaneIndex];

		const FVector PlaneNormal = FVector(Plane.X, Plane.Y, Plane.Z);
		const float PlaneW = Plane.W;

		const FVector AbsNormal(FMath::Abs(PlaneNormal.X), FMath::Abs(PlaneNormal.Y), FMath::Abs(PlaneNormal.Z));
		const float Distance = FVector::DotProduct(PlaneNormal, BoxCenter) + PlaneW;
		const float Radius = FVector::DotProduct(AbsNormal, BoxExtent);

		if (Distance + Radius < 0.0f)
		{
			return false;
		}
	}

	return true;
}

void AGrassManager::PerformFrustumCulling()
{
	if (!GrassConfig || !GrassConfig->bEnableFrustumCulling)
	{
		for (FGrassChunkData& Chunk : GrassChunks)
		{
			Chunk.bInFrustum = true;
		}
		FrustumCulledCount = 0;
		return;
	}

	FrustumCulledCount = 0;

	for (FGrassChunkData& Chunk : GrassChunks)
	{
		Chunk.bInFrustum = IsBoxInFrustum(Chunk.BoundingBox, CurrentFrustumPlanes, GrassConfig->FrustumCullPadding);

		if (!Chunk.bInFrustum)
		{
			FrustumCulledCount += Chunk.InstanceCount;

			const int32 StartIdx = Chunk.InstanceStartIndex;
			const int32 EndIdx = FMath::Min(StartIdx + Chunk.InstanceCount, AllInstances.Num());

			for (int32 i = StartIdx; i < EndIdx; i++)
			{
				AllInstances[i].bInFrustum = false;
			}
		}
		else
		{
			const int32 StartIdx = Chunk.InstanceStartIndex;
			const int32 EndIdx = FMath::Min(StartIdx + Chunk.InstanceCount, AllInstances.Num());

			for (int32 i = StartIdx; i < EndIdx; i++)
			{
				AllInstances[i].bInFrustum = true;
			}
		}
	}
}

void AGrassManager::PerformOcclusionCulling()
{
	if (!GrassConfig || !GrassConfig->bEnableOcclusionCulling)
	{
		for (FGrassChunkData& Chunk : GrassChunks)
		{
			Chunk.ChunkOcclusionState = EOcclusionState::Visible;
		}
		OcclusionCulledCount = 0;
		return;
	}

	const float OcclusionInterval = GrassConfig->OcclusionTestInterval;
	const int32 MaxQueriesPerFrame = GrassConfig->MaxOcclusionQueriesPerFrame;

	if (TimeSinceLastOcclusionTest < OcclusionInterval)
	{
		return;
	}

	TimeSinceLastOcclusionTest = 0.0f;

	UpdateHZBTexture();

	int32 QueriesThisFrame = 0;
	const int32 ChunkCount = GrassChunks.Num();

	for (int32 i = 0; i < ChunkCount && QueriesThisFrame < MaxQueriesPerFrame; i++)
	{
		const int32 ChunkIdx = (CurrentOcclusionTestChunk + i) % ChunkCount;
		FGrassChunkData& Chunk = GrassChunks[ChunkIdx];

		if (!Chunk.bInFrustum)
		{
			Chunk.ChunkOcclusionState = EOcclusionState::Occluded;
			continue;
		}

		TestChunkOcclusion(Chunk);
		QueriesThisFrame++;
	}

	CurrentOcclusionTestChunk = (CurrentOcclusionTestChunk + QueriesThisFrame) % ChunkCount;

	UpdateChunkOcclusionStates();
}

void AGrassManager::TestChunkOcclusion(FGrassChunkData& Chunk)
{
	if (!GrassConfig)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
	if (!CameraManager)
	{
		return;
	}

	const FVector CameraLocation = CameraManager->GetCameraLocation();
	const FVector ChunkCenter = Chunk.BoundingBox.GetCenter();
	const float DistanceToCamera = FVector::Dist(CameraLocation, ChunkCenter);

	if (DistanceToCamera > GrassConfig->CullDistance * 2.0f)
	{
		Chunk.ChunkOcclusionState = EOcclusionState::Occluded;
		return;
	}

	if (GrassConfig->bUseHZBForOcclusion && HZBDepthTexture)
	{
		const FVector2D ScreenPos = ProjectWorldToScreen(ChunkCenter);
		
		if (ScreenPos.X < 0.0f || ScreenPos.X > 1.0f || ScreenPos.Y < 0.0f || ScreenPos.Y > 1.0f)
		{
			Chunk.ChunkOcclusionState = EOcclusionState::Occluded;
			return;
		}

		const float ChunkDepth = GetHZBDepth(ChunkCenter);
		const FVector ToChunk = ChunkCenter - CameraLocation;
		const float CameraDepth = ToChunk.Size();

		if (ChunkDepth > 0.0f && CameraDepth > ChunkDepth + GrassConfig->HZBDepthBias)
		{
			Chunk.ChunkOcclusionState = EOcclusionState::Occluded;
		}
		else
		{
			Chunk.ChunkOcclusionState = EOcclusionState::Visible;
		}
	}
	else
	{
		const FVector CameraDirection = CameraManager->GetCameraRotation().Vector();
		const FVector ToChunk = ChunkCenter - CameraLocation;
		const float Distance = ToChunk.Size();
		const FVector Direction = ToChunk.GetSafeNormal();

		const bool bInFront = FVector::DotProduct(Direction, CameraDirection) > -0.3f;
		
		if (bInFront && Distance < GrassConfig->CullDistance)
		{
			Chunk.ChunkOcclusionState = EOcclusionState::Visible;
		}
		else
		{
			Chunk.ChunkOcclusionState = EOcclusionState::Occluded;
		}
	}

	Chunk.OcclusionQueryId = Chunk.ChunkIndex;
}

void AGrassManager::UpdateChunkOcclusionStates()
{
	OcclusionCulledCount = 0;

	for (const FGrassChunkData& Chunk : GrassChunks)
	{
		if (Chunk.ChunkOcclusionState == EOcclusionState::Occluded)
		{
			OcclusionCulledCount += Chunk.InstanceCount;
		}
	}
}

void AGrassManager::ApplyCullingResults()
{
	for (FGrassChunkData& Chunk : GrassChunks)
	{
		const bool bShouldBeVisible = Chunk.bInFrustum && Chunk.ChunkOcclusionState != EOcclusionState::Occluded;

		if (!bShouldBeVisible && Chunk.bIsVisible)
		{
			const int32 StartIdx = Chunk.InstanceStartIndex;
			const int32 EndIdx = FMath::Min(StartIdx + Chunk.InstanceCount, AllInstances.Num());

			for (int32 i = StartIdx; i < EndIdx; i++)
			{
				if (!AllInstances[i].bIsHidden && AllInstances[i].CurrentLOD != EGrassLOD::Culled)
				{
					if (GrassConfig && GrassConfig->bUseHiddenInsteadOfRemove)
					{
						HideInstanceInISM(AllInstances[i]);
					}
					else
					{
						RemoveInstanceFromISM(AllInstances[i]);
					}
				}
			}
		}

		Chunk.bIsVisible = bShouldBeVisible;
	}
}

float AGrassManager::GetHZBDepth(const FVector& WorldPosition) const
{
	if (!HZBDepthTexture)
	{
		return 0.0f;
	}

	return 0.0f;
}

void AGrassManager::InitializeHZBResources()
{
	if (!GrassConfig || !GrassConfig->bUseHZBForOcclusion)
	{
		return;
	}

	HZBDepthTexture = NewObject<UTextureRenderTarget2D>(this);
	if (HZBDepthTexture)
	{
		HZBDepthTexture->InitCustomFormat(512, 512, PF_DepthStencil, false);
		HZBDepthTexture->UpdateResource();
	}
}

void AGrassManager::UpdateHZBTexture()
{
}

FVector2D AGrassManager::ProjectWorldToScreen(const FVector& WorldPos) const
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return FVector2D(-1.0f, -1.0f);
	}

	APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
	if (!CameraManager)
	{
		return FVector2D(-1.0f, -1.0f);
	}

	FVector2D ScreenPos;
	UGameplayStatics::ProjectWorldToScreen(CameraManager->GetOwningPlayerController(), WorldPos, ScreenPos);

	if (GEngine && GEngine->GameViewport)
	{
		FVector2D ViewportSize;
		GEngine->GameViewport->GetViewportSize(ViewportSize);

		if (ViewportSize.X > 0.0f && ViewportSize.Y > 0.0f)
		{
			return FVector2D(ScreenPos.X / ViewportSize.X, ScreenPos.Y / ViewportSize.Y);
		}
	}

	return FVector2D(-1.0f, -1.0f);
}

void AGrassManager::UpdateLODStates()
{
	UWorld* World = GetWorld();
	if (!World || !GrassConfig)
	{
		return;
	}

	APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
	if (!CameraManager)
	{
		return;
	}

	const FVector CameraLocation = CameraManager->GetCameraLocation();
	const FVector EffectiveCameraPos = GrassConfig->bEnableCameraPrediction ? PredictedCameraPosition : CameraLocation;

	CloseCount = 0;
	MediumCount = 0;
	FarCount = 0;
	ImpostorCount = 0;
	CulledCount = 0;

	const int32 MaxUpdates = GrassConfig->MaxInstancesPerFrame;
	const int32 BatchSize = GrassConfig->UpdateBatchSize;

	int32 UpdatedThisFrame = 0;

	const int32 TotalCount = AllInstances.Num();
	if (TotalCount == 0)
	{
		return;
	}

	if (CurrentUpdateBatchStart >= TotalCount)
	{
		CurrentUpdateBatchStart = 0;
	}

	const int32 BatchEnd = FMath::Min(CurrentUpdateBatchStart + BatchSize, TotalCount);

	for (int32 i = CurrentUpdateBatchStart; i < BatchEnd && UpdatedThisFrame < MaxUpdates; i++)
	{
		FGrassInstance& Instance = AllInstances[i];

		if (!Instance.bInFrustum)
		{
			if (Instance.CurrentLOD != EGrassLOD::Culled && !Instance.bIsHidden)
			{
				if (GrassConfig->bUseHiddenInsteadOfRemove)
				{
					HideInstanceInISM(Instance);
				}
				else
				{
					RemoveInstanceFromISM(Instance);
				}
				Instance.CurrentLOD = EGrassLOD::Culled;
			}
			continue;
		}

		const EGrassLOD NewTargetLOD = CalculateLOD(Instance.Position, EffectiveCameraPos, Instance.CurrentLOD);

		if (NewTargetLOD != Instance.CurrentLOD)
		{
			ProcessLODTransition(Instance, NewTargetLOD, GrassConfig->LODUpdateInterval);
			UpdatedThisFrame++;
		}
		else
		{
			Instance.LODConfirmCount = 0;
			Instance.TransitionState = ELODTransitionState::Stable;
		}

		switch (Instance.CurrentLOD)
		{
		case EGrassLOD::Close:
			if (!Instance.bIsHidden) CloseCount++;
			break;
		case EGrassLOD::Medium:
			if (!Instance.bIsHidden) MediumCount++;
			break;
		case EGrassLOD::Far:
			if (!Instance.bIsHidden)
			{
				FarCount++;
				ImpostorCount++;
			}
			break;
		case EGrassLOD::Culled:
			CulledCount++;
			break;
		}
	}

	CurrentUpdateBatchStart = BatchEnd % TotalCount;

	const int32 RenderedCount = GetRenderedCount();
	CullingEfficiency = TotalGrassCount > 0 ? static_cast<float>(RenderedCount) / static_cast<float>(TotalGrassCount) : 0.0f;
}

void AGrassManager::UpdateChunkVisibility()
{
	UWorld* World = GetWorld();
	if (!World || !GrassConfig)
	{
		return;
	}

	APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
	if (!CameraManager)
	{
		return;
	}

	const FVector CameraLocation = CameraManager->GetCameraLocation();
	const FVector CameraDirection = CameraManager->GetCameraRotation().Vector();
	const float CullDist = GrassConfig->CullDistance;

	for (FGrassChunkData& Chunk : GrassChunks)
	{
		const FVector ChunkCenter = Chunk.BoundingBox.GetCenter();
		const FVector ToChunk = ChunkCenter - CameraLocation;
		const float Distance = ToChunk.Size();

		const bool bInFront = FVector::DotProduct(ToChunk.GetSafeNormal(), CameraDirection) > -0.7f;
		const bool bInRange = Distance < CullDist + GetHysteresisDistance(CullDist);

		const bool bDistanceVisible = bInFront && bInRange;

		if (!bDistanceVisible && Chunk.bInFrustum)
		{
			const int32 StartIdx = Chunk.InstanceStartIndex;
			const int32 EndIdx = FMath::Min(StartIdx + Chunk.InstanceCount, AllInstances.Num());

			for (int32 i = StartIdx; i < EndIdx; i++)
			{
				if (AllInstances[i].CurrentLOD != EGrassLOD::Culled && !AllInstances[i].bIsHidden)
				{
					if (GrassConfig->bUseHiddenInsteadOfRemove)
					{
						HideInstanceInISM(AllInstances[i]);
					}
					else
					{
						RemoveInstanceFromISM(AllInstances[i]);
					}
					AllInstances[i].CurrentLOD = EGrassLOD::Culled;
					AllInstances[i].TargetLOD = EGrassLOD::Culled;
				}
			}
		}
	}
}

float AGrassManager::CalculateTransitionAlpha(const FVector& Position, const FVector& CameraPosition) const
{
	if (!GrassConfig || !GrassConfig->bEnableTransitionBlend)
	{
		return 1.0f;
	}

	const float Distance = FVector::Dist(Position, CameraPosition);
	const float BlendDist = GrassConfig->TransitionBlendDistance;

	float Alpha = 1.0f;

	const float CloseDist = GrassConfig->CloseLODDistance;
	const float MediumDist = GrassConfig->MediumLODDistance;
	const float FarDist = GrassConfig->FarLODDistance;
	const float CullDist = GrassConfig->CullDistance;

	if (Distance > CloseDist - BlendDist && Distance < CloseDist + BlendDist)
	{
		Alpha = FMath::Clamp((Distance - (CloseDist - BlendDist)) / (2.0f * BlendDist), 0.0f, 1.0f);
	}
	else if (Distance > MediumDist - BlendDist && Distance < MediumDist + BlendDist)
	{
		Alpha = FMath::Clamp((Distance - (MediumDist - BlendDist)) / (2.0f * BlendDist), 0.0f, 1.0f);
	}
	else if (Distance > FarDist - BlendDist && Distance < FarDist + BlendDist)
	{
		Alpha = FMath::Clamp((Distance - (FarDist - BlendDist)) / (2.0f * BlendDist), 0.0f, 1.0f);
	}
	else if (Distance > CullDist - BlendDist)
	{
		Alpha = FMath::Clamp((CullDist + BlendDist - Distance) / BlendDist, 0.0f, 1.0f);
	}

	return Alpha;
}

void AGrassManager::UpdateTransitionAlphas(float DeltaTime)
{
	if (!GrassConfig || !GrassConfig->bEnableTransitionBlend)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(World, 0);
	if (!CameraManager)
	{
		return;
	}

	const FVector CameraLocation = CameraManager->GetCameraLocation();
	const float TransitionSpeed = 1.0f / FMath::Max(GrassConfig->TransitionBlendDistance / 100.0f, 0.1f);

	const int32 MaxUpdates = FMath::Min(GrassConfig->MaxInstancesPerFrame / 2, AllInstances.Num());

	for (int32 i = 0; i < MaxUpdates; i++)
	{
		const int32 InstanceIdx = (CurrentUpdateBatchStart + i) % AllInstances.Num();
		FGrassInstance& Instance = AllInstances[InstanceIdx];

		const float TargetAlpha = CalculateTransitionAlpha(Instance.Position, CameraLocation);
		const float CurrentAlpha = Instance.TransitionAlpha;

		Instance.TransitionAlpha = FMath::FInterpConstantTo(CurrentAlpha, TargetAlpha, DeltaTime, TransitionSpeed);
	}
}

void AGrassManager::UpdateHiddenInstances()
{
}

void AGrassManager::UpdateGrassTransforms()
{
}

void AGrassManager::UpdateWind(float DeltaTime)
{
	if (!GrassConfig || !GrassConfig->bEnableWind)
	{
		return;
	}

	static float WindTime = 0.0f;
	WindTime += DeltaTime * WindSpeed;

	UpdateMaterialParameters();
}

void AGrassManager::UpdateMaterialParameters()
{
	if (!GrassConfig)
	{
		return;
	}

	const FVector WindDir = GlobalWindDirection.GetSafeNormal();

	if (GrassConfig->GrassMaterial)
	{
		GrassConfig->GrassMaterial->SetVectorParameterValue(FName("WindDirection"), FLinearColor(WindDir.X, WindDir.Y, WindDir.Z, 0.0f));
		GrassConfig->GrassMaterial->SetScalarParameterValue(FName("WindStrength"), GlobalWindStrength);
		GrassConfig->GrassMaterial->SetScalarParameterValue(FName("WindFrequency"), GrassConfig->WindFrequency);
	}

	if (GrassConfig->ImpostorMaterial)
	{
		GrassConfig->ImpostorMaterial->SetVectorParameterValue(FName("WindDirection"), FLinearColor(WindDir.X, WindDir.Y, WindDir.Z, 0.0f));
		GrassConfig->ImpostorMaterial->SetScalarParameterValue(FName("WindStrength"), GlobalWindStrength * 0.5f);
	}
}
