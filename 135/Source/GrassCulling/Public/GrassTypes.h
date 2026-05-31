// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GrassTypes.generated.h"

UENUM(BlueprintType)
enum class EGrassLOD : uint8
{
	Close		UMETA(DisplayName = "Close (Full Mesh)"),
	Medium		UMETA(DisplayName = "Medium (Simplified Mesh)"),
	Far			UMETA(DisplayName = "Far (Impostor Billboard)"),
	Culled		UMETA(DisplayName = "Culled")
};

UENUM(BlueprintType)
enum class ELODTransitionState : uint8
{
	Stable		UMETA(DisplayName = "Stable"),
	Transitioning	UMETA(DisplayName = "Transitioning")
};

UENUM(BlueprintType)
enum class EOcclusionState : uint8
{
	Unknown		UMETA(DisplayName = "Unknown"),
	Visible		UMETA(DisplayName = "Visible"),
	Occluded	UMETA(DisplayName = "Occluded"),
	Pending		UMETA(DisplayName = "Pending Query")
};

USTRUCT(BlueprintType)
struct FGrassInstance
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	FVector Position;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	FRotator Rotation;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	FVector Scale;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	int32 ISMIndex;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	EGrassLOD CurrentLOD;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	EGrassLOD TargetLOD;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	int32 ImpostorISMIndex;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	float RandomSeed;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	int32 LODConfirmCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	float TransitionAlpha;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	ELODTransitionState TransitionState;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	float LastUpdateTime;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	bool bIsHidden;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Occlusion")
	EOcclusionState OcclusionState;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Occlusion")
	float LastOcclusionTestTime;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Occlusion")
	bool bInFrustum;

	FGrassInstance()
		: Position(FVector::ZeroVector)
		, Rotation(FRotator::ZeroRotator)
		, Scale(FVector(1.0f))
		, ISMIndex(INDEX_NONE)
		, CurrentLOD(EGrassLOD::Culled)
		, TargetLOD(EGrassLOD::Culled)
		, ImpostorISMIndex(INDEX_NONE)
		, RandomSeed(0.0f)
		, LODConfirmCount(0)
		, TransitionAlpha(1.0f)
		, TransitionState(ELODTransitionState::Stable)
		, LastUpdateTime(0.0f)
		, bIsHidden(false)
		, OcclusionState(EOcclusionState::Unknown)
		, LastOcclusionTestTime(0.0f)
		, bInFrustum(true)
	{
	}
};

USTRUCT(BlueprintType)
struct FGrassChunkData
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	FBox BoundingBox;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	TArray<FGrassInstance> Instances;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	bool bIsVisible;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	int32 ChunkIndex;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	int32 InstanceStartIndex;

	UPROPERTY(VisibleAnywhere, Category = "Grass")
	int32 InstanceCount;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Occlusion")
	EOcclusionState ChunkOcclusionState;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Occlusion")
	bool bInFrustum;

	UPROPERTY(VisibleAnywhere, Category = "Grass|Occlusion")
	int32 OcclusionQueryId;

	FGrassChunkData()
		: BoundingBox(EForceInit::ForceInit)
		, bIsVisible(false)
		, ChunkIndex(INDEX_NONE)
		, InstanceStartIndex(INDEX_NONE)
		, InstanceCount(0)
		, ChunkOcclusionState(EOcclusionState::Unknown)
		, bInFrustum(true)
		, OcclusionQueryId(INDEX_NONE)
	{
	}
};

USTRUCT(BlueprintType)
struct FOcclusionQueryResult
{
	GENERATED_BODY()

	UPROPERTY()
	int32 ChunkIndex;

	UPROPERTY()
	bool bIsVisible;

	UPROPERTY()
	FBox TestBounds;

	UPROPERTY()
	float TestTime;

	FOcclusionQueryResult()
		: ChunkIndex(INDEX_NONE)
		, bIsVisible(false)
		, TestBounds(EForceInit::ForceInit)
		, TestTime(0.0f)
	{
	}
};

USTRUCT(BlueprintType)
struct FFrustumPlanes
{
	GENERATED_BODY()

	FPlane Planes[6];

	FFrustumPlanes()
	{
	}
};
