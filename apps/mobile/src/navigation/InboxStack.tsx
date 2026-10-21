import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InboxScreen } from '../screens/InboxScreen';
import { ConversationDetailScreen } from '../screens/ConversationDetailScreen';

export type InboxStackParamList = {
  InboxList: undefined;
  ConversationDetail: { conversationId: string };
};

const Stack = createNativeStackNavigator<InboxStackParamList>();

export function InboxStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="InboxList" component={InboxScreen} />
      <Stack.Screen name="ConversationDetail" component={ConversationDetailScreen} />
    </Stack.Navigator>
  );
}
