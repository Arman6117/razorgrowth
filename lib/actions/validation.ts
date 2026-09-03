import { prisma } from "../prisma";
import {
  ValidationError,
  NotFoundError,
  InactiveProductError,
} from "./errors";

export interface ValidatedMerchant {
  id: string;
  name: string;
  currency: string;
}

export interface ValidatedOpportunity {
  id: string;
  title: string;
  sourceProductId: string | null;
  targetProductId: string | null;
  status: string;
}

export interface ValidatedProduct {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

export interface ValidationContext {
  merchant: ValidatedMerchant;
  opportunity: ValidatedOpportunity;
  sourceProductId: string | null;
  targetProduct: ValidatedProduct;
  priceInRupees: number;
  amountInPaise: number;
}

/**
 * Validates merchant existence and returns merchant record.
 */
export async function validateMerchant(merchantId: string): Promise<ValidatedMerchant> {
  if (!merchantId?.trim()) {
    throw new ValidationError("merchantId is required");
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });

  if (!merchant) {
    throw new NotFoundError(`Merchant not found with ID: ${merchantId}`);
  }

  return merchant;
}

/**
 * Validates opportunity existence and ownership, resolving authoritative source & target product IDs.
 */
export async function validateOpportunityAndProducts(
  merchantId: string,
  opportunityId: string,
  inputSourceProductId?: string | null,
  inputTargetProductId?: string | null
): Promise<{
  opportunity: ValidatedOpportunity;
  sourceProductId: string | null;
  targetProductId: string;
}> {
  if (!opportunityId?.trim()) {
    throw new ValidationError("opportunityId is required");
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
    select: {
      id: true,
      title: true,
      sourceProductId: true,
      targetProductId: true,
      status: true,
    },
  });

  if (!opportunity) {
    throw new NotFoundError(
      `Opportunity not found or does not belong to merchant: ${opportunityId}`
    );
  }

  const sourceProductId =
    opportunity.sourceProductId || inputSourceProductId || null;
  const targetProductId =
    opportunity.targetProductId || inputTargetProductId || null;

  if (!targetProductId) {
    throw new ValidationError("Opportunity is missing targetProductId");
  }

  if (
    inputTargetProductId &&
    opportunity.targetProductId &&
    inputTargetProductId !== opportunity.targetProductId
  ) {
    throw new ValidationError(
      `targetProductId '${inputTargetProductId}' does not match opportunity targetProductId '${opportunity.targetProductId}'`
    );
  }

  if (
    inputSourceProductId &&
    opportunity.sourceProductId &&
    inputSourceProductId !== opportunity.sourceProductId
  ) {
    throw new ValidationError(
      `sourceProductId '${inputSourceProductId}' does not match opportunity sourceProductId '${opportunity.sourceProductId}'`
    );
  }

  return {
    opportunity,
    sourceProductId,
    targetProductId,
  };
}

/**
 * Validates target product existence, merchant ownership, active status, and resolves authoritative price.
 */
export async function validateTargetProduct(
  merchantId: string,
  targetProductId: string
): Promise<{
  targetProduct: ValidatedProduct;
  priceInRupees: number;
  amountInPaise: number;
}> {
  const targetProduct = await prisma.product.findFirst({
    where: { id: targetProductId, merchantId },
    select: { id: true, name: true, price: true, active: true },
  });

  if (!targetProduct) {
    throw new NotFoundError(
      `Target product not found or does not belong to merchant: ${targetProductId}`
    );
  }

  if (!targetProduct.active) {
    throw new InactiveProductError(
      `Target product '${targetProduct.name}' is inactive`
    );
  }

  const priceInRupees = Number(targetProduct.price);
  if (isNaN(priceInRupees) || priceInRupees <= 0) {
    throw new ValidationError(
      `Invalid target product price in database: ₹${targetProduct.price}`
    );
  }

  const amountInPaise = Math.round(priceInRupees * 100);

  return {
    targetProduct: {
      ...targetProduct,
      price: priceInRupees,
    },
    priceInRupees,
    amountInPaise,
  };
}

/**
 * Validates merchant, opportunity, and target product in one shared step.
 */
export async function validateGrowthActionContext(
  merchantId: string,
  opportunityId: string,
  inputSourceProductId?: string | null,
  inputTargetProductId?: string | null
): Promise<ValidationContext> {
  const merchant = await validateMerchant(merchantId);
  const { opportunity, sourceProductId, targetProductId } =
    await validateOpportunityAndProducts(
      merchantId,
      opportunityId,
      inputSourceProductId,
      inputTargetProductId
    );
  const { targetProduct, priceInRupees, amountInPaise } =
    await validateTargetProduct(merchantId, targetProductId);

  return {
    merchant,
    opportunity,
    sourceProductId,
    targetProduct,
    priceInRupees,
    amountInPaise,
  };
}
