// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "GrassTypes.h"
#include "GrassData.generated.h"

class UStaticMesh;
class UMaterialInterface;

UCLASS(BlueprintType)
class GRASSCULLING_API UGrassData : public UDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, Category = "Grass|Mesh")
	UStaticMesh* GrassMesh;

	UPROPERTY(EditAnywhere, Category = "Grass|Mesh")
	UStaticMesh* GrassSimplifiedMesh;

	UPROPERTY(EditAnywhere, Category = "Grass|Mesh")
	UStaticMesh* ImpostorBillboardMesh;

	UPROPERTY(EditAnywhere, Category = "Grass|Material")
	UMaterialInterface* GrassMaterial;

	UPROPERTY(EditAnywhere, Category = "Grass|Material")
	UMaterialInterface* ImpostorMaterial;

	UPROPERTY(EditAnywhere, Category = "Grass|Spawning", meta = (ClampMin = "0.0", UIMin = "0.0"))
	FVector2D SpawnExtent;

	UPROPERTY(EditAnywhere, Category = "Grass|Spawning", meta = (ClampMin = "1", UIMin = "1"))
	int32 ChunkSize;

	UPROPERTY(EditAnywhere, Category = "Grass|Spawning", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float SpawnDensity;

	UPROPERTY(EditAnywhere, Category = "Grass|Spawning")
	FVector2D ScaleRange;

	UPROPERTY(EditAnywhere, Category = "Grass|Spawning")
	bool bRandomRotation;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float CloseLODDistance;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float MediumLODDistance;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float FarLODDistance;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float CullDistance;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD|Hysteresis", meta = (ClampMin = "0.0", UIMin = "0.0", ClampMax = "1.0", UIMax = "1.0"))
	float LODHysteresisPercent;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD|Hysteresis", meta = (ClampMin = "0", UIMin = "0"))
	int32 RequiredLODConfirmations;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD|Transition", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float TransitionBlendDistance;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD|Transition")
	bool bEnableTransitionBlend;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD|Prediction")
	bool bEnableCameraPrediction;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD|Prediction", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float PredictionTimeHorizon;

	UPROPERTY(EditAnywhere, Category = "Grass|LOD|Prediction", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float MaxPredictionDistance;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|Frustum")
	bool bEnableFrustumCulling;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|Frustum", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float FrustumCullPadding;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|Occlusion")
	bool bEnableOcclusionCulling;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|Occlusion", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float OcclusionTestInterval;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|Occlusion", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float OcclusionQueryPadding;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|Occlusion", meta = (ClampMin = "1", UIMin = "1"))
	int32 MaxOcclusionQueriesPerFrame;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|Occlusion")
	bool bUseHZBForOcclusion;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|HZB", meta = (ClampMin = "1", UIMin = "1"))
	int32 HZBMipLevels;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|HZB", meta = (ClampMin = "1", UIMin = "1"))
	int32 HZBSampleCount;

	UPROPERTY(EditAnywhere, Category = "Grass|Culling|HZB", meta = (ClampMin = "0.0", UIMin = "0.0"))
	float HZBDepthBias;

	UPROPERTY(EditAnywhere, Category = "Grass|Wind")
	bool bEnableWind;

	UPROPERTY(EditAnywhere, Category = "Grass|Wind")
	float WindStrength;

	UPROPERTY(EditAnywhere, Category = "Grass|Wind")
	float WindFrequency;

	UPROPERTY(EditAnywhere, Category = "Grass|Wind")
	FVector WindDirection;

	UPROPERTY(EditAnywhere, Category = "Grass|Niagara")
	TArray<FVector> WindFieldSamplePositions;

	UPROPERTY(EditAnywhere, Category = "Grass|Performance")
	int32 MaxInstancesPerFrame;

	UPROPERTY(EditAnywhere, Category = "Grass|Performance")
	float LODUpdateInterval;

	UPROPERTY(EditAnywhere, Category = "Grass|Performance")
	int32 UpdateBatchSize;

	UPROPERTY(EditAnywhere, Category = "Grass|Performance")
	bool bUseHiddenInsteadOfRemove;

	UGrassData()
	{
		GrassMesh = nullptr;
		GrassSimplifiedMesh = nullptr;
		ImpostorBillboardMesh = nullptr;
		GrassMaterial = nullptr;
		ImpostorMaterial = nullptr;

		SpawnExtent = FVector2D(5000.0f, 5000.0f);
		ChunkSize = 1000;
		SpawnDensity = 0.5f;
		ScaleRange = FVector2D(0.8f, 1.2f);
		bRandomRotation = true;

		CloseLODDistance = 500.0f;
		MediumLODDistance = 1500.0f;
		FarLODDistance = 3000.0f;
		CullDistance = 5000.0f;

		LODHysteresisPercent = 0.15f;
		RequiredLODConfirmations = 2;
		TransitionBlendDistance = 100.0f;
		bEnableTransitionBlend = true;

		bEnableCameraPrediction = true;
		PredictionTimeHorizon = 0.5f;
		MaxPredictionDistance = 500.0f;

		bEnableFrustumCulling = true;
		FrustumCullPadding = 50.0f;

		bEnableOcclusionCulling = true;
		OcclusionTestInterval = 0.25f;
		OcclusionQueryPadding = 20.0f;
		MaxOcclusionQueriesPerFrame = 50;
		bUseHZBForOcclusion = true;
		HZBMipLevels = 6;
		HZBSampleCount = 4;
		HZBDepthBias = 0.02f;

		bEnableWind = true;
		WindStrength = 10.0f;
		WindFrequency = 1.0f;
		WindDirection = FVector(1.0f, 0.5f, 0.0f);
		WindFieldSamplePositions.Empty();

		MaxInstancesPerFrame = 1000;
		LODUpdateInterval = 0.1f;
		UpdateBatchSize = 200;
		bUseHiddenInsteadOfRemove = true;
	}
};
