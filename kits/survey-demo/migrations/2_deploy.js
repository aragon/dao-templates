const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS')
const MiniMeToken = artifacts.require('@aragon/os/contracts/lib/minime/MiniMeToken')
const MiniMeTokenFactory = artifacts.require('@aragon/os/contracts/lib/minime/MiniMeTokenFactory')
const PublicResolver = artifacts.require('@aragon/os/contracts/lib/ens/PublicResolver')
const Repo = artifacts.require('@aragon/os/contracts/apm/Repo')

const SurveyKit = artifacts.require('@aragon/kits-survey/contracts/SurveyKit')
const Survey = artifacts.require('@aragon/apps-survey/contracts/Survey')

// Utils
const surveyAppId = namehash('survey.aragonpm.eth')
const surveyKitEnsNode = namehash('survey-kit.aragonpm.eth')
const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const createdSurveyDao = receipt => receipt.logs.filter(x => x.event == 'DeployInstance')[0].args.dao
const createdSurveyId = receipt => receipt.logs.filter(x => x.event == 'StartSurvey')[0].args.surveyId
const installedApp = (receipt, appId) => receipt.logs.filter(x => x.event == 'InstalledApp' && x.args.appId === appId)[0].args.appProxy

// Survey params
const SURVEY_DURATION = 60 * 60 * 16 // 24 hours
const SURVEY_PARTICIATION = pct16(10) // 10%
const SURVEY_CHART_BLOCKS = 16 // front-end chart blocks
const TOKEN_BASE_DECIMAL = 1e18

module.exports = async (deployer, network, accounts) => {
  const root = accounts[0]

  const ens = ENS.at(
    process.env.ENS ||
    '0x5f6f7e8cc7346a11ca2def8f827b7a0b612c56a1' // aragen's default ENS
  )
  const surveyKitRepo = Repo.at(
    await PublicResolver.at(
      await ens.resolver(surveyKitEnsNode)
    ).addr(surveyKitEnsNode)
  )
  // Contract address is second return of Repo.getLatest()
  const surveyKit = SurveyKit.at((await surveyKitRepo.getLatest())[1])

  // Create minime token and assign to accounts
  const minimeFac = await MiniMeTokenFactory.new()
  const surveyToken = await MiniMeToken.new(
    minimeFac.address,
    '0x00',
    '0x00',
    'Demo Survey',
    18,
    'SUR',
    true
  )

  // Total of 30 tokens being assigned
  const tokenAssignments = [
    TOKEN_BASE_DECIMAL * 16,
    TOKEN_BASE_DECIMAL * 8,
    TOKEN_BASE_DECIMAL * 4,
    TOKEN_BASE_DECIMAL * 2
  ]
  await Promise.all(
    tokenAssignments.map((amount, i) => {
      const account = accounts[i]
      console.log(`Assigned ${account} ${amount} tokens`)
      return surveyToken.generateTokens(accounts[i], amount)
    })
  )

  // Create DAO with just Survey installed
  console.log('Creating Survey DAO...')
  const surveyDaoReceipt = await surveyKit.newInstance(surveyToken.address, root, '0x00', SURVEY_DURATION, SURVEY_PARTICIATION)
  const surveyDaoAddr = createdSurveyDao(surveyDaoReceipt)
  const surveyAppAddr = installedApp(surveyDaoReceipt, surveyAppId)

  // Create some sample surveys and vote on them
  const survey = Survey.at(surveyAppAddr)

  const newSurvey = ({ question, description, options, url }) => {
    const metadata = {
      specId: namehash('1.metadata.survey.aragonpm.eth'),
      metadata: {
        question,
        description,
        options,
        url,
      }
    }
    return survey.newSurvey(JSON.stringify(metadata), options.length)
  }
  const voteSurvey = (surveyId, { options, stakes }, txOptions) => {
    return survey.voteOptions(surveyId, options, stakes, txOptions)
  }

  // Start some surveys
  console.log('Creating some surveys...')
  const surveyMetadata = [
    {
      question: 'When should the Aragon Network be launched?',
      description: 'The Aragon Network is an upcoming launch by the Aragon team!',
      options: ['Q1 2019', 'Q2 2019', 'Q3 2019', 'Q4 2019', 'Soon'],
      url: 'https://github.com/aragon/nest/issues/1',
    },
    {
      question: 'Should ANT be redeployed as an ERC-777 token?',
      description: 'The current ANT token is a MiniMe token, but this is costly in gas for most users.',
      options: ['Yes', 'No'],
      url: 'https://github.com/aragon/nest/issues/2',
    },
    {
      question: 'What should we name our 0.6 release?',
      description: 'We want your help in naming it!',
      options: ['Buidler', 'Engineer', 'Artist', 'Infinity'],
      url: 'https://github.com/aragon/nest/issues/3',
    },
    {
      question: 'Should we get Carlos Matos?',
      description: 'Coming to an event near you!',
      options: ['OMG YES', ':sigh:', "You're telling me, he's real???"],
      url: 'https://github.com/aragon/nest/issues/4',
    },
  ]
  const surveys = await Promise.all(
    surveyMetadata.map(
      metadata => newSurvey(metadata)
        .then(receipt => ({
          metadata,
          id: receipt.logs.filter(x => x.event === 'StartSurvey')[0].args.surveyId,
        }))
    )
  )

  // Vote on the surveys—each account will vote for a few options at a specific
  // point in time (to make them show up in different time buckets in the UI)
  // REMEMBER: optionIds start from 1, not 0!
  console.log('Voting on the surveys...')
  const account1Votes = [
    {
      options: [5],
      stakes: [TOKEN_BASE_DECIMAL * 5],
    },
    {
      options: [2],
      stakes: [TOKEN_BASE_DECIMAL * 2],
    },
    {
      options: [1, 3],
      stakes: [TOKEN_BASE_DECIMAL * 8, TOKEN_BASE_DECIMAL * 3],
    },
  ]
  await Promise.all(
    account1Votes.map(
      (voteParams, index) => voteSurvey(surveys[index].id, voteParams, { from: accounts[0] })
    )
  )
  await timeTravel(SURVEY_DURATION / SURVEY_CHART_BLOCKS + 1)

  const account2Votes = [
    {
      options: [1, 2],
      stakes: [TOKEN_BASE_DECIMAL * 1, TOKEN_BASE_DECIMAL * 1],
    },
    {
      options: [1],
      stakes: [TOKEN_BASE_DECIMAL * 1],
    },
    {
      options: [2],
      stakes: [TOKEN_BASE_DECIMAL * 1],
    },
  ]
  await Promise.all(
    account2Votes.map(
      (voteParams, index) => voteSurvey(surveys[index].id, voteParams, { from: accounts[1] })
    )
  )
  await timeTravel(SURVEY_DURATION / SURVEY_CHART_BLOCKS + 1)

  const account3Votes = [
    {
      options: [3, 4],
      stakes: [TOKEN_BASE_DECIMAL * 2, TOKEN_BASE_DECIMAL * 1],
    },
    {
      options: [2],
      stakes: [TOKEN_BASE_DECIMAL * 4],
    },
    {
      options: [2],
      stakes: [TOKEN_BASE_DECIMAL * 1],
    },
  ]
  await Promise.all(
    account3Votes.map(
      (voteParams, index) => voteSurvey(surveys[index].id, voteParams, { from: accounts[2] })
    )
  )
  await timeTravel(SURVEY_DURATION / SURVEY_CHART_BLOCKS + 1)

  const account4Votes = [
    {
      options: [1],
      stakes: [TOKEN_BASE_DECIMAL * 1],
    },
    {
      options: [1],
      stakes: [TOKEN_BASE_DECIMAL * 1],
    },
    {
      options: [1],
      stakes: [TOKEN_BASE_DECIMAL * 1],
    },
  ]
  await Promise.all(
    account4Votes.map(
      (voteParams, index) => voteSurvey(surveys[index].id, voteParams, { from: accounts[3] })
    )
  )
  await timeTravel(SURVEY_DURATION / SURVEY_CHART_BLOCKS + 1)

  console.log('===========')
  console.log('Survey demo DAO set up!')
  console.log('Survey DAO:', surveyDaoAddr)
  console.log("Survey DAO's Survey app:", surveyAppAddr)
  console.log('Survey Token:', surveyToken.address)
}
