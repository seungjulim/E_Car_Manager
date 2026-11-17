/** Drizzle 관계 정의 (db.query.* 의 `with` 조회용). DB 제약은 각 테이블의 references 가 담당. */
import { relations } from 'drizzle-orm';
import { catalogBrands, catalogImages, catalogModels, catalogTrims, modelPopularity } from './catalog';
import {
  inspectionRecordItems,
  inspectionRecords,
  inspectionTemplateItems,
  inspectionTemplates,
  vehicleMaintenanceSchedules,
} from './inspection';
import {
  chargingLogs,
  documentImages,
  documents,
  fuelingLogs,
  insurancePolicies,
  mileageLogs,
  repairQuotes,
  repairRequests,
  repairShops,
  serviceRecords,
  vehicles,
} from './maintenance';
import { purchaseChecks, wishlist } from './shop';

export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  mileageLogs: many(mileageLogs),
  serviceRecords: many(serviceRecords),
  insurancePolicies: many(insurancePolicies),
  chargingLogs: many(chargingLogs),
  fuelingLogs: many(fuelingLogs),
  documents: many(documents),
  inspectionRecords: many(inspectionRecords),
  schedules: many(vehicleMaintenanceSchedules),
  repairRequests: many(repairRequests),
}));

export const mileageLogsRelations = relations(mileageLogs, ({ one }) => ({
  vehicle: one(vehicles, { fields: [mileageLogs.vehicleId], references: [vehicles.id] }),
}));

export const serviceRecordsRelations = relations(serviceRecords, ({ one, many }) => ({
  vehicle: one(vehicles, { fields: [serviceRecords.vehicleId], references: [vehicles.id] }),
  shop: one(repairShops, { fields: [serviceRecords.shopId], references: [repairShops.id] }),
  quote: one(repairQuotes, { fields: [serviceRecords.repairQuoteId], references: [repairQuotes.id] }),
  documents: many(documents),
}));

export const insurancePoliciesRelations = relations(insurancePolicies, ({ one }) => ({
  vehicle: one(vehicles, { fields: [insurancePolicies.vehicleId], references: [vehicles.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  vehicle: one(vehicles, { fields: [documents.vehicleId], references: [vehicles.id] }),
  serviceRecord: one(serviceRecords, { fields: [documents.serviceRecordId], references: [serviceRecords.id] }),
  images: many(documentImages),
}));

export const documentImagesRelations = relations(documentImages, ({ one }) => ({
  document: one(documents, { fields: [documentImages.documentId], references: [documents.id] }),
}));

export const repairRequestsRelations = relations(repairRequests, ({ one, many }) => ({
  vehicle: one(vehicles, { fields: [repairRequests.vehicleId], references: [vehicles.id] }),
  quotes: many(repairQuotes),
}));

export const repairQuotesRelations = relations(repairQuotes, ({ one }) => ({
  request: one(repairRequests, { fields: [repairQuotes.requestId], references: [repairRequests.id] }),
  shop: one(repairShops, { fields: [repairQuotes.shopId], references: [repairShops.id] }),
  document: one(documents, { fields: [repairQuotes.documentId], references: [documents.id] }),
}));

export const inspectionTemplatesRelations = relations(inspectionTemplates, ({ many }) => ({
  items: many(inspectionTemplateItems),
}));

export const inspectionTemplateItemsRelations = relations(inspectionTemplateItems, ({ one }) => ({
  template: one(inspectionTemplates, {
    fields: [inspectionTemplateItems.templateId],
    references: [inspectionTemplates.id],
  }),
}));

export const inspectionRecordsRelations = relations(inspectionRecords, ({ one, many }) => ({
  vehicle: one(vehicles, { fields: [inspectionRecords.vehicleId], references: [vehicles.id] }),
  template: one(inspectionTemplates, { fields: [inspectionRecords.templateId], references: [inspectionTemplates.id] }),
  items: many(inspectionRecordItems),
}));

export const inspectionRecordItemsRelations = relations(inspectionRecordItems, ({ one }) => ({
  record: one(inspectionRecords, { fields: [inspectionRecordItems.recordId], references: [inspectionRecords.id] }),
}));

export const vehicleSchedulesRelations = relations(vehicleMaintenanceSchedules, ({ one }) => ({
  vehicle: one(vehicles, { fields: [vehicleMaintenanceSchedules.vehicleId], references: [vehicles.id] }),
}));

/* ---------- 신차 ---------- */
export const catalogBrandsRelations = relations(catalogBrands, ({ many }) => ({
  models: many(catalogModels),
}));

export const catalogModelsRelations = relations(catalogModels, ({ one, many }) => ({
  brand: one(catalogBrands, { fields: [catalogModels.brandId], references: [catalogBrands.id] }),
  trims: many(catalogTrims),
  images: many(catalogImages),
  popularity: many(modelPopularity),
}));

export const catalogTrimsRelations = relations(catalogTrims, ({ one, many }) => ({
  model: one(catalogModels, { fields: [catalogTrims.modelId], references: [catalogModels.id] }),
  images: many(catalogImages),
}));

export const catalogImagesRelations = relations(catalogImages, ({ one }) => ({
  model: one(catalogModels, { fields: [catalogImages.modelId], references: [catalogModels.id] }),
  trim: one(catalogTrims, { fields: [catalogImages.trimId], references: [catalogTrims.id] }),
}));

export const modelPopularityRelations = relations(modelPopularity, ({ one }) => ({
  model: one(catalogModels, { fields: [modelPopularity.modelId], references: [catalogModels.id] }),
}));

export const wishlistRelations = relations(wishlist, ({ one, many }) => ({
  trim: one(catalogTrims, { fields: [wishlist.trimId], references: [catalogTrims.id] }),
  checks: many(purchaseChecks),
}));

export const purchaseChecksRelations = relations(purchaseChecks, ({ one }) => ({
  wishlistItem: one(wishlist, { fields: [purchaseChecks.wishlistId], references: [wishlist.id] }),
}));
