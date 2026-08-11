import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateErrandConfigDto } from '../../errand/dto/errand.admin.dto'
import { UpdateFeeConfigDto } from './errand-admin.dto'

const productionValidationOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
}

async function rejectedPropertiesFor(dtoClass: new () => object, payload: Record<string, any>) {
  const dto = plainToInstance(dtoClass, payload)
  const errors = await validate(dto, productionValidationOptions)
  return errors.map(error => error.property)
}

describe('errand admin DTO whitelist', () => {
  it('allows order-taking policy fields when saving errand fee config', async () => {
    const rejectedProperties = await rejectedPropertiesFor(UpdateFeeConfigDto, {
      orderTakingPolicy: {
        ordinaryUserEnabled: true,
        receiverChoiceEnabled: true,
        ordinaryUserFallbackEnabled: true,
      },
      order_taking_policy: {
        ordinary_user_enabled: true,
        receiver_choice_enabled: true,
      },
      riskTagConfig: {
        express_pickup: [{ key: 'large', label: '大件' }],
      },
      risk_tag_config: {
        food_delivery: [{ key: 'cake', label: '蛋糕' }],
      },
      closureVersion: 2,
      autoReceiptEnabled: false,
      settlementV2Enabled: true,
    })

    expect(rejectedProperties).toEqual([])
  })

  it('allows order-taking policy fields on the legacy errand config DTO too', async () => {
    const rejectedProperties = await rejectedPropertiesFor(UpdateErrandConfigDto, {
      orderTakingPolicy: {
        ordinaryUserEnabled: true,
        receiverChoiceEnabled: true,
      },
      order_taking_policy: {
        ordinary_user_enabled: true,
        receiver_choice_enabled: true,
      },
      riskTagConfig: {
        express_pickup: [{ key: 'large', label: '大件' }],
      },
      risk_tag_config: {
        food_delivery: [{ key: 'cake', label: '蛋糕' }],
      },
    })

    expect(rejectedProperties).toEqual([])
  })
})
