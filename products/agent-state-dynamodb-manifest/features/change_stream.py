def apply(state):
    state['input']['StreamSpecification'] = {'StreamEnabled': True, 'StreamViewType': 'NEW_AND_OLD_IMAGES'}
    state['checks']['Table.StreamSpecification'] = {'StreamEnabled': True, 'StreamViewType': 'NEW_AND_OLD_IMAGES'}


feature = {'id': 'change-stream', 'apply': apply}
